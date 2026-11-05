import assert from "node:assert/strict";
import {
	createHash,
	generateKeyPairSync,
	randomBytes,
	sign,
} from "node:crypto";
import { after, before, test } from "node:test";
import {
	jwks,
	member,
	oauthClient,
	oauthConsent,
	oauthRefreshToken,
	organization,
	user,
} from "@ekra/db";
import { eq, inArray } from "drizzle-orm";
import { app } from "./app.ts";
import { AUTH_ISSUER, auth, MCP_RESOURCE } from "./auth/index.ts";
import { db } from "./db.ts";
import { call, cookieFrom, linkInLatestEmail, post } from "./test-helpers.ts";

const stamp = Date.now();
const NAMES = ["owner", "learner", "other"] as const;
type Name = (typeof NAMES)[number];
const emailOf = (name: Name) => `mcp-${name}-${stamp}@test.ekra`;
const slugs = { mine: `mcp-mine-${stamp}`, theirs: `mcp-theirs-${stamp}` };
const cookies = {} as Record<Name, string>;
const ids = {} as Record<Name, string>;
const REDIRECT = "http://127.0.0.1:43123/callback";
let clientId = "";
/** an access token from the real OAuth flow (authorization code + PKCE), for the owner */
let ownerToken = "";
let pageId = "";

const mcp = (token: string | null, body: unknown) =>
	app.request("/api/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	});

const rpc = (method: string, params: object = {}) => ({
	jsonrpc: "2.0",
	id: 1,
	method,
	params,
});

async function callTool(token: string, name: string, args: object = {}) {
	const res = await mcp(token, rpc("tools/call", { name, arguments: args }));
	assert.equal(res.status, 200);
	const body = (await res.json()) as {
		result: { isError?: boolean; content: { text: string }[] };
	};
	return {
		isError: !!body.result.isError,
		value: JSON.parse(body.result.content[0]?.text ?? "null"),
	};
}

/** A token signed with Ekra's own key, with whatever claims a test needs. */
const signed = async (payload: Record<string, unknown>) =>
	(await auth.api.signJWT({ body: { payload } })).token;

const claimsFor = (name: Name) => ({
	sub: ids[name],
	azp: clientId,
	iss: AUTH_ISSUER,
	aud: MCP_RESOURCE,
	exp: Math.floor(Date.now() / 1000) + 300,
});

/** Signs in, approves the agent and swaps the code for a token, the way an MCP client does. */
async function oauthFlow(cookie: string) {
	const registered = await post("/api/auth/oauth2/register", {
		client_name: "Test agent",
		redirect_uris: [REDIRECT],
		token_endpoint_auth_method: "none",
	});
	assert.ok(registered.ok, await registered.clone().text());
	clientId = ((await registered.json()) as { client_id: string }).client_id;

	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	const authorize = await call(
		`/api/auth/oauth2/authorize?${new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: REDIRECT,
			scope: "profile email offline_access",
			state: "s1",
			code_challenge: challenge,
			code_challenge_method: "S256",
			resource: MCP_RESOURCE,
		})}`,
		{ cookie, headers: { accept: "application/json" } },
	);
	const consentAt = new URL(
		authorize.headers.get("location") ??
			((await authorize.json()) as { url: string }).url,
		AUTH_ISSUER,
	);
	assert.equal(consentAt.pathname, "/oauth/consent");

	const consent = await post(
		"/api/auth/oauth2/consent",
		{ accept: true, oauth_query: consentAt.search.slice(1) },
		cookie,
	);
	assert.ok(consent.ok, await consent.clone().text());
	const back = new URL(((await consent.json()) as { url: string }).url);
	const code = back.searchParams.get("code");
	assert.ok(code);

	const token = await app.request("/api/auth/oauth2/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: REDIRECT,
			client_id: clientId,
			code_verifier: verifier,
			resource: MCP_RESOURCE,
		}).toString(),
	});
	assert.ok(token.ok, await token.clone().text());
	return ((await token.json()) as { access_token: string }).access_token;
}

before(async () => {
	for (const name of NAMES) {
		await post("/api/auth/sign-in/magic-link", {
			email: emailOf(name),
			callbackURL: "/",
		});
		cookies[name] = cookieFrom(await call(linkInLatestEmail(emailOf(name))));
		const [u] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, emailOf(name)));
		ids[name] = u?.id ?? "";
	}
	await post(
		"/api/auth/organization/create",
		{ name: "Mine", slug: slugs.mine },
		cookies.owner,
	);
	await post(
		"/api/auth/organization/create",
		{ name: "Theirs", slug: slugs.theirs },
		cookies.other,
	);
	const [org] = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.slug, slugs.mine));
	await db.insert(member).values({
		organizationId: org?.id ?? "",
		userId: ids.learner,
		role: "learner",
	});
	ownerToken = await oauthFlow(cookies.owner);
	// the learner approved the same agent too
	await db.insert(oauthConsent).values({
		id: `mcp-${stamp}`,
		clientId,
		userId: ids.learner,
		scopes: ["profile", "email", "offline_access"],
	});
});

after(async () => {
	await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
	await db
		.delete(organization)
		.where(inArray(organization.slug, Object.values(slugs)));
	await db.delete(user).where(inArray(user.email, NAMES.map(emailOf)));
});

test("without a token: 401, saying where to sign in", async () => {
	const res = await mcp(null, rpc("tools/list"));
	assert.equal(res.status, 401);
	assert.match(
		res.headers.get("www-authenticate") ?? "",
		/^Bearer resource_metadata=".+\/\.well-known\/oauth-protected-resource"/,
	);
});

test("a session cookie isn't enough", async () => {
	const res = await call("/api/mcp", {
		method: "POST",
		cookie: cookies.owner,
		body: JSON.stringify(rpc("tools/list")),
	});
	assert.equal(res.status, 401);
});

test("forged, expired and wrong-audience tokens: 401", async () => {
	const [key] = await db.select({ id: jwks.id }).from(jwks).limit(1);
	const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const part = (o: object) =>
		Buffer.from(JSON.stringify(o)).toString("base64url");
	const unsigned = `${part({ alg: "RS256", kid: key?.id })}.${part(claimsFor("owner"))}`;
	const forged = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
	const expired = await signed({
		...claimsFor("owner"),
		exp: Math.floor(Date.now() / 1000) - 10,
	});
	const otherAudience = await signed({
		...claimsFor("owner"),
		aud: AUTH_ISSUER,
	});
	const otherIssuer = await signed({
		...claimsFor("owner"),
		iss: "https://elsewhere.example",
	});
	for (const token of [forged, expired, otherAudience, otherIssuer, "nope"]) {
		const res = await mcp(token, rpc("tools/list"));
		assert.equal(res.status, 401);
		assert.ok(res.headers.get("www-authenticate"));
	}
});

test("a token from the OAuth flow lists the tools, read-only ones marked", async () => {
	const res = await mcp(ownerToken, rpc("tools/list"));
	assert.equal(res.status, 200);
	const { result } = (await res.json()) as {
		result: {
			tools: { name: string; annotations?: { readOnlyHint?: boolean } }[];
		};
	};
	const names = result.tools.map((t) => t.name);
	assert.ok(names.includes("listOrganizations"));
	assert.ok(names.includes("assignContent"));
	assert.equal(
		result.tools.find((t) => t.name === "listLibrary")?.annotations
			?.readOnlyHint,
		true,
	);
});

test("listOrganizations returns only the person's own organizations", async () => {
	const { isError, value } = await callTool(ownerToken, "listOrganizations");
	assert.equal(isError, false);
	assert.deepEqual(
		(value as { slug: string; role: string }[]).map((o) => [o.slug, o.role]),
		[[slugs.mine, "owner"]],
	);
});

test("a manager creates a draft and finds it in the library", async () => {
	const created = await callTool(ownerToken, "createContent", {
		organization: slugs.mine,
		kind: "page",
		title: "Welcome aboard",
	});
	assert.equal(created.isError, false, JSON.stringify(created.value));
	pageId = created.value.createContent.id;
	const found = await callTool(ownerToken, "listLibrary", {
		organization: slugs.mine,
		search: "welcome",
	});
	assert.deepEqual(
		found.value.items.map((i: { id: string }) => i.id),
		[created.value.createContent.id],
	);
});

test("another organization's slug is refused", async () => {
	for (const name of ["listLibrary", "listMembers"]) {
		const { isError, value } = await callTool(ownerToken, name, {
			organization: slugs.theirs,
		});
		assert.equal(isError, true);
		assert.match(value.error, /organization you belong to/);
	}
});

test("a learner can't use manager-only tools", async () => {
	const token = await signed(claimsFor("learner"));
	const mine = await callTool(token, "listOrganizations");
	assert.deepEqual(
		mine.value.map((o: { role: string }) => o.role),
		["learner"],
	);
	for (const [name, args] of [
		["learnerReport", {}],
		["listMembers", {}],
		["assignContent", { contentId: pageId, userIds: [ids.learner] }],
		["createContent", { kind: "page", title: "Sneaky" }],
	] as const) {
		const { isError, value } = await callTool(token, name, {
			organization: slugs.mine,
			...args,
		});
		assert.equal(isError, true, name);
		assert.doesNotMatch(value.error, /Something went wrong/);
	}
	// the owner's own token can assign the same page
	const assigned = await callTool(ownerToken, "assignContent", {
		organization: slugs.mine,
		contentId: pageId,
		userIds: [ids.learner],
	});
	assert.equal(assigned.isError, false, JSON.stringify(assigned.value));
});

test("disconnecting the app (consent deleted) stops its tokens at once", async () => {
	const token = await signed(claimsFor("learner"));
	assert.equal((await mcp(token, rpc("tools/list"))).status, 200);
	await db.delete(oauthConsent).where(eq(oauthConsent.userId, ids.learner));
	assert.equal((await mcp(token, rpc("tools/list"))).status, 401);
});

test("GET /api/mcp is 405 and the protected-resource document names /api/mcp", async () => {
	assert.equal((await app.request("/api/mcp")).status, 405);
	const doc = (await (
		await app.request("/api/.well-known/oauth-protected-resource")
	).json()) as { resource: string; authorization_servers: string[] };
	assert.equal(doc.resource, MCP_RESOURCE);
	assert.deepEqual(doc.authorization_servers, [AUTH_ISSUER]);
	const server = (await (
		await app.request("/api/.well-known/oauth-authorization-server")
	).json()) as { issuer: string; registration_endpoint: string };
	assert.equal(server.issuer, AUTH_ISSUER);
	assert.ok(server.registration_endpoint);
});

test("Disconnect in Settings ends the approval and the app's refresh tokens", async () => {
	const consents = (await (
		await call("/api/auth/oauth2/get-consents", { cookie: cookies.owner })
	).json()) as { id: string; clientId: string }[];
	const consent = consents.find((c) => c.clientId === clientId);
	assert.ok(consent);
	const res = await post(
		"/api/auth/oauth2/delete-consent",
		{ id: consent.id },
		cookies.owner,
	);
	assert.ok(res.ok, await res.clone().text());
	assert.equal((await mcp(ownerToken, rpc("tools/list"))).status, 401);
	const live = await db
		.select({ revoked: oauthRefreshToken.revoked })
		.from(oauthRefreshToken)
		.where(eq(oauthRefreshToken.userId, ids.owner));
	assert.ok(live.length > 0);
	assert.ok(live.every((t) => t.revoked));
});

test("through the web app's forwarder, a page load is redirected and a request with a body still works", async () => {
	const query = new URLSearchParams({
		response_type: "code",
		client_id: clientId,
		redirect_uri: REDIRECT,
		scope: "profile",
		code_challenge: "x".repeat(43),
		code_challenge_method: "S256",
	});
	const page = await call(`/api/auth/oauth2/authorize?${query}`, {
		headers: { "x-forwarded-fetch-mode": "navigate", accept: "text/html" },
	});
	assert.equal(page.status, 302);
	assert.match(page.headers.get("location") ?? "", /\/oauth\/signin\?/);
	const script = await call(`/api/auth/oauth2/authorize?${query}`, {
		headers: { "x-forwarded-fetch-mode": "cors", accept: "text/html" },
	});
	assert.equal(script.status, 200);
	const registered = await call("/api/auth/oauth2/register", {
		method: "POST",
		headers: { "x-forwarded-fetch-mode": "none" },
		body: JSON.stringify({
			client_name: "Forwarded",
			redirect_uris: [REDIRECT],
			token_endpoint_auth_method: "none",
		}),
	});
	assert.equal(registered.status, 201, await registered.clone().text());
	const { client_id } = (await registered.json()) as { client_id: string };
	await db.delete(oauthClient).where(eq(oauthClient.clientId, client_id));
});

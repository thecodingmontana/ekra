import { createPublicKey, verify } from "node:crypto";
import { AGENT_TOOLS, type AgentTool } from "@ekra/core";
import { jwks, oauthConsent, user } from "@ekra/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { and, eq } from "drizzle-orm";
import { useLogger } from "evlog/hono";
import type { Context } from "hono";
import { z } from "zod";
import { AGENT_TOOL_NAMES, type Person, runAgentTool } from "./agent-tools.ts";
import { AUTH_ISSUER, MCP_RESOURCE } from "./auth/index.ts";
import { db } from "./db.ts";
import { fixedWindow } from "./rate-limit.ts";

// Ekra as an MCP server: an AI agent (Claude Code, Cursor, Codex…) that signed in as a person over OAuth uses
// Ekra as that person, with their role in each organization. The tools are shared with the built-in assistant
// (AGENT_TOOLS in @ekra/core, run by ./agent-tools.ts), so every permission and tenant check applies as in the app.

// What an agent knows about Ekra the moment it connects. Only facts from the README and PLAN.md.
const ABOUT = `Ekra is a self-hosted, multi-tenant learning platform for companies training their teams and creators publishing courses.

What it has:
- Organizations, each with its own members and roles: owner, admin and trainer run it (create content, assign it, see reports); learners and guests learn what they're given.
- A library of learning content: pages, courses (sections of video, page and quiz lessons), quizzes, learning paths (stages of steps) and folders, as drafts or published.
- Assignments: managers assign content to people with optional start and due dates, and track status and progress.
- My learning: what you've been assigned, your progress and your certificates.
- Reports: learners (activity, completion, overdue), content (completion per item) and quiz results per question.

How to work here: you act as the signed-in person, with exactly their role in each organization (you can't do anything they can't). Start with listOrganizations to get an organization slug; every other tool takes it as "organization". Use listLibrary to find content ids, and listMembers for people's ids, before changing anything. Your changes are the person's own and show up live for everyone in that organization.`;

const CALLS_PER_MINUTE = 120;
const calls = fixedWindow(CALLS_PER_MINUTE, 60_000);
const b64 = (s: string) => Buffer.from(s, "base64url");

/** The person and app behind an agent's access token, or null unless it's a live, valid token for /api/mcp. */
export async function verifyAgentToken(token: string) {
	const [h, p, sig] = token.split(".");
	if (!h || !p || !sig) return null;
	let header: { alg?: string; kid?: string };
	let claims: {
		sub?: string;
		azp?: string;
		iss?: string;
		aud?: string | string[];
		exp?: number;
	};
	try {
		header = JSON.parse(b64(h).toString());
		claims = JSON.parse(b64(p).toString());
	} catch {
		return null;
	}
	if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
	const [key] = await db
		.select({ publicKey: jwks.publicKey })
		.from(jwks)
		.where(eq(jwks.id, header.kid));
	if (!key) return null;
	let signed = false;
	try {
		signed = verify(
			"RSA-SHA256",
			Buffer.from(`${h}.${p}`),
			createPublicKey({ key: JSON.parse(key.publicKey), format: "jwk" }),
			b64(sig),
		);
	} catch {
		return null;
	}
	if (!signed) return null;
	if (claims.iss !== AUTH_ISSUER || ![claims.aud].flat().includes(MCP_RESOURCE))
		return null;
	if (!claims.exp || claims.exp * 1000 <= Date.now()) return null;
	if (typeof claims.sub !== "string" || typeof claims.azp !== "string")
		return null;
	// still approved: disconnecting the app deletes the consent, so this stops it at once
	const [consent] = await db
		.select({ id: oauthConsent.id })
		.from(oauthConsent)
		.where(
			and(
				eq(oauthConsent.userId, claims.sub),
				eq(oauthConsent.clientId, claims.azp),
			),
		);
	return consent ? { userId: claims.sub, clientId: claims.azp } : null;
}

const organization = z
	.string()
	.min(1)
	.max(64)
	.describe("the organization's slug, from listOrganizations");

/** One MCP server for this person's request (stateless: nothing is kept between requests). */
function serverFor(person: Person) {
	const server = new McpServer(
		{ name: "ekra", title: "Ekra", version: "1.0.0", websiteUrl: AUTH_ISSUER },
		{ instructions: ABOUT },
	);
	const log = useLogger();
	for (const name of AGENT_TOOL_NAMES) {
		const tool: AgentTool = AGENT_TOOLS[name];
		server.registerTool(
			name,
			{
				description: tool.description,
				inputSchema: tool.everyOrganization
					? tool.input
					: { organization, ...tool.input },
				annotations: {
					readOnlyHint: tool.access === "read",
					...(tool.access !== "read" && {
						destructiveHint: tool.access === "destructive",
					}),
				},
			},
			async ({ organization: slug, ...args }: Record<string, unknown>) => {
				const result = await runAgentTool(
					name,
					person,
					String(slug ?? ""),
					args,
					log,
				);
				const error = "error" in result;
				return {
					content: [
						{
							type: "text" as const,
							text: JSON.stringify(error ? result : result.data),
						},
					],
					isError: error,
				};
			},
		);
	}
	return server;
}

/** 401 and 429 say where to sign in (RFC 9728), so the agent can start the OAuth flow. */
const challenge = (status: 401 | 429, error: string) =>
	new Response(JSON.stringify({ error }), {
		status,
		headers: {
			"content-type": "application/json",
			"www-authenticate": `Bearer resource_metadata="${AUTH_ISSUER}/.well-known/oauth-protected-resource"${status === 401 ? `, error="invalid_token"` : ""}`,
			...(status === 429 ? { "retry-after": "60" } : {}),
		},
	});

/** POST /api/mcp: one MCP request from a signed-in agent. Bearer token only, never a cookie. */
export async function mcpResponse(c: Context) {
	const token = c.req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
	const who = token ? await verifyAgentToken(token) : null;
	if (!who) return challenge(401, "Sign in to Ekra first.");
	const log = useLogger();
	log.set({ user: { id: who.userId }, mcp: { client: who.clientId } });
	if (calls.hit(who.userId))
		return challenge(429, "Too many requests. Slow down for a minute.");
	const [person] = await db.select().from(user).where(eq(user.id, who.userId));
	if (!person) return challenge(401, "That account is gone.");
	const server = serverFor(person);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	return transport.handleRequest(c.req.raw);
}

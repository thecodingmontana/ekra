import assert from "node:assert/strict";
import { test } from "node:test";
import { tenantUrls } from "./tenant-url.ts";

const t = tenantUrls("http://ekra.localhost:3000");
const href = (u: URL | undefined) => u?.href;

test("an organization's subdomain opens its pages", () => {
	assert.equal(
		href(t.input(new URL("http://acme.ekra.localhost:3000/"))),
		"http://acme.ekra.localhost:3000/o/acme",
	);
	assert.equal(
		href(
			t.input(new URL("http://acme.ekra.localhost:3000/settings/security?x=1")),
		),
		"http://acme.ekra.localhost:3000/o/acme/settings/security?x=1",
	);
	assert.equal(t.slugOf(new URL("http://acme.ekra.localhost:3000/")), "acme");
});

test("shared pages and the app's own address are left alone", () => {
	for (const url of [
		"http://acme.ekra.localhost:3000/api/graphql",
		"http://acme.ekra.localhost:3000/sign-in",
		"http://ekra.localhost:3000/settings",
		"http://evil.com/",
		"http://acme.ekra.localhost:4000/",
		"http://a.b.ekra.localhost:3000/",
	])
		assert.equal(t.input(new URL(url)), undefined, url);
});

test("organization routes are shown on their subdomain, everything else on the app", () => {
	assert.equal(
		href(
			t.output(new URL("http://ekra.localhost:3000/o/acme/settings/profile")),
		),
		"http://acme.ekra.localhost:3000/settings/profile",
	);
	assert.equal(
		href(t.output(new URL("http://beta.ekra.localhost:3000/o/acme"))),
		"http://acme.ekra.localhost:3000/",
	);
	assert.equal(
		href(t.output(new URL("http://acme.ekra.localhost:3000/sign-in"))),
		"http://ekra.localhost:3000/sign-in",
	);
	assert.equal(
		t.output(new URL("http://ekra.localhost:3000/onboarding")),
		undefined,
	);
});

test("on bare localhost (no shared cookie possible) organizations stay at /o/acme", () => {
	const plain = tenantUrls("http://localhost:3000");
	assert.equal(plain.input(new URL("http://acme.localhost:3000/")), undefined);
	assert.equal(
		plain.output(new URL("http://localhost:3000/o/acme/settings")),
		undefined,
	);
});

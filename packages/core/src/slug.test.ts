import assert from "node:assert/strict";
import { test } from "node:test";
import { slugify, slugProblem } from "./slug.ts";

test("slugify makes a URL name from an organization name", () => {
	assert.equal(slugify("Acme Learning Co."), "acme-learning-co");
	assert.equal(slugify("  Café Zürich  "), "cafe-zurich");
	assert.equal(slugify("---Hi---there---"), "hi-there");
	assert.equal(slugify("a".repeat(60)).length, 48);
	assert.equal(
		slugify(`${"x".repeat(47)} y`),
		"x".repeat(47),
		"never ends with a hyphen after cutting",
	);
});

test("slugProblem accepts good slugs", () => {
	for (const ok of ["acme", "acme-academy", "abc", "a1b", "x".repeat(48)]) {
		assert.equal(slugProblem(ok), null, ok);
	}
});

test("slugProblem explains what's wrong", () => {
	assert.match(slugProblem("ab") ?? "", /at least 3/);
	assert.match(slugProblem("x".repeat(49)) ?? "", /at most 48/);
	for (const bad of ["Acme", "-acme", "acme-", "ac me", "acme--co", "acmé"]) {
		assert.match(slugProblem(bad) ?? "", /lowercase letters/, bad);
	}
	assert.match(slugProblem("www") ?? "", /reserved/);
	assert.match(slugProblem("api") ?? "", /reserved/);
});

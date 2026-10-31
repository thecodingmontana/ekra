import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordProblem, passwordScore } from "./password.ts";

test("passwordScore counts the rules met", () => {
	assert.equal(passwordScore(""), 0);
	assert.equal(passwordScore("abc"), 1);
	assert.equal(passwordScore("abcdefghij"), 2);
	assert.equal(passwordScore("abcdefghij1"), 3);
	assert.equal(passwordScore("Abcdefghij1"), 4);
});

test("passwordProblem lists what's missing, or null when strong", () => {
	assert.equal(passwordProblem("Correct horse 9"), null);
	assert.equal(
		passwordProblem("short"),
		"Your password needs: at least 10 characters, at least 1 number, at least 1 uppercase letter.",
	);
	assert.match(passwordProblem("ALLUPPERCASE1") ?? "", /lowercase/);
});

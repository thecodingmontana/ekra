import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./next-path.ts";

test("safeNextPath keeps paths on this site", () => {
	for (const ok of ["/", "/courses", "/courses?tab=mine#top", "/a/b/c"])
		assert.equal(safeNextPath(ok), ok);
});

test("safeNextPath refuses anything that could leave the site", () => {
	for (const bad of [
		"//evil.com",
		"/\\evil.com",
		"/\\/evil.com",
		"/\t/evil.com",
		"/\n/evil.com",
		"https://evil.com",
		"evil.com",
		"",
		undefined,
		42,
	])
		assert.equal(safeNextPath(bad), undefined, JSON.stringify(bad));
});

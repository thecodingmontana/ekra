import assert from "node:assert/strict";
import { test } from "node:test";
import { settingsGroupsFor } from "./settings-nav.ts";

const pages = (role: string) =>
	settingsGroupsFor(role).flatMap((g) => g.items.map((i) => i.label));

test("only people who run the organization see Members in settings", () => {
	assert.ok(pages("owner").includes("Members"));
	assert.ok(pages("learner,trainer").includes("Members"));
	assert.ok(!pages("learner").includes("Members"));
	assert.ok(!pages("guest").includes("Members"));
	assert.ok(pages("learner").includes("Profile"));
});

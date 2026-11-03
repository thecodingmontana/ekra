import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assignableRoles,
	canManageContent,
	canManageMember,
	mainRole,
} from "./members.ts";

const owner = { userId: "o", role: "owner" };
const admin = { userId: "a", role: "admin" };

test("owners and admins manage other members, never themselves", () => {
	const learner = { userId: "l", role: "learner" };
	assert.equal(
		canManageMember({ viewer: owner, member: learner, owners: 1 }),
		true,
	);
	assert.equal(
		canManageMember({ viewer: admin, member: learner, owners: 1 }),
		true,
	);
	assert.equal(
		canManageMember({ viewer: admin, member: admin, owners: 1 }),
		false,
	);
	assert.equal(
		canManageMember({ viewer: owner, member: owner, owners: 2 }),
		false,
	);
});

test("learners, trainers and guests manage no one", () => {
	for (const role of ["learner", "trainer", "guest"])
		assert.equal(
			canManageMember({
				viewer: { userId: "x", role },
				member: { userId: "l", role: "learner" },
				owners: 1,
			}),
			false,
		);
});

test("the last owner can't be changed, and admins never change owners", () => {
	const other = { userId: "o2", role: "owner" };
	assert.equal(
		canManageMember({ viewer: owner, member: other, owners: 1 }),
		false,
	);
	assert.equal(
		canManageMember({ viewer: owner, member: other, owners: 2 }),
		true,
	);
	assert.equal(
		canManageMember({ viewer: admin, member: other, owners: 2 }),
		false,
	);
});

test("a combined role counts each part", () => {
	assert.equal(mainRole("trainer,admin"), "admin");
	assert.equal(
		canManageMember({
			viewer: { userId: "x", role: "trainer,admin" },
			member: { userId: "l", role: "learner" },
			owners: 1,
		}),
		true,
	);
	assert.deepEqual(assignableRoles("admin"), [
		"admin",
		"trainer",
		"learner",
		"guest",
	]);
	assert.equal(assignableRoles("owner").length, 5);
});

test("owners, admins and trainers manage content; learners and guests don't", () => {
	for (const r of ["owner", "admin", "trainer", "learner,trainer"])
		assert.equal(canManageContent(r), true, r);
	for (const r of ["learner", "guest", ""])
		assert.equal(canManageContent(r), false, r);
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { createDb, migrateDatabase, organization } from "./index.ts";

// Tests write and delete rows: refuse to run them against anything but a test database.
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
	throw new Error(
		'Set TEST_DATABASE_URL to a database whose name contains "test" (see SETUP.md).',
	);
}

const { db, close } = createDb(url);
const slug = `test-${Date.now()}`;

before(() => migrateDatabase(url));

after(async () => {
	await db.delete(organization).where(eq(organization.slug, slug));
	await close();
});

test("creates an organization with a nanoid and default kind", async () => {
	const [created] = await db
		.insert(organization)
		.values({ name: "Acme", slug })
		.returning();
	assert.ok(created);
	assert.match(created.id, /^[0-9A-Za-z]{16}$/, "a 16-character nanoid");
	assert.equal(created.kind, "company");
	assert.ok(created.createdAt instanceof Date);
});

test("refuses a second organization with the same slug", async () => {
	// 23505 = unique_violation; Drizzle wraps the driver error in `cause`
	await assert.rejects(
		db.insert(organization).values({ name: "Acme again", slug }),
		(error: Error & { cause?: { code?: string } }) =>
			error.cause?.code === "23505",
	);
});

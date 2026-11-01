import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
	contentItem,
	createDb,
	migrateDatabase,
	organization,
	withOrg,
} from "./index.ts";

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

test("row-level security keeps each organization's content to itself", async () => {
	const stamp = Date.now();
	const [a, b] = await db
		.insert(organization)
		.values([
			{ name: "A", slug: `rls-a-${stamp}` },
			{ name: "B", slug: `rls-b-${stamp}` },
		])
		.returning({ id: organization.id });
	if (!a || !b) throw new Error("organizations not created");
	try {
		await withOrg(db, a.id, (tx) =>
			tx
				.insert(contentItem)
				.values({ orgId: a.id, kind: "course", title: "A's course" }),
		);

		// no org_id filter at all: Postgres still only shows the transaction's organization
		const seenByB = await withOrg(db, b.id, (tx) =>
			tx.select().from(contentItem),
		);
		assert.deepEqual(seenByB, []);
		const seenByA = await withOrg(db, a.id, (tx) =>
			tx.select().from(contentItem),
		);
		assert.deepEqual(
			seenByA.map((row) => row.title),
			["A's course"],
		);

		// writing into another organization is refused by the policy's check
		await assert.rejects(
			withOrg(db, b.id, (tx) =>
				tx
					.insert(contentItem)
					.values({ orgId: a.id, kind: "page", title: "sneaky" }),
			),
		);
		// and B can't change or delete A's rows: they're invisible to it
		const changed = await withOrg(db, b.id, (tx) =>
			tx.update(contentItem).set({ title: "hacked" }).returning(),
		);
		assert.equal(changed.length, 0);
	} finally {
		await db.delete(organization).where(inArray(organization.id, [a.id, b.id]));
	}
});

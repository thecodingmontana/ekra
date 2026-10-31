// Loaded before every server test (`node --import`): point the server at the test database and bring it up to date.
// Tests sign people up and delete them again, so they refuse to run against anything but a test database.
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
	throw new Error(
		'Set TEST_DATABASE_URL to a database whose name contains "test" (see SETUP.md).',
	);
}

process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";
// test-only stand-in, never used outside tests
process.env.BETTER_AUTH_SECRET ??=
	"test-only-secret-0123456789-abcdefghijklmnop";

// imported after DATABASE_URL is set: @ekra/db checks its env when it loads
const { migrateDatabase } = await import("@ekra/db");
await migrateDatabase(url);

export {};

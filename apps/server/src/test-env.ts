// Loaded before every server test (`node --import`): point the server at the test database.
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
// emails are kept in memory (src/test-helpers.ts reads links from them), never sent
process.env.EMAIL_PROVIDER = "console";

// the test database is migrated once before the test files start (src/test-migrate.ts), not by each of them:
// test files run in parallel, and two processes applying the same migration collide

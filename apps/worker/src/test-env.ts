// Loaded before every worker test (`node --import`): point the server at the test database.
// Tests write and delete rows, so they refuse to run against anything but a test database.
const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
	throw new Error(
		'Set TEST_DATABASE_URL to a database whose name contains "test" (see SETUP.md).',
	);
}

process.env.DATABASE_URL = url;
process.env.NODE_ENV = "test";

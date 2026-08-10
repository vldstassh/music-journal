import test from "node:test";
import assert from "node:assert/strict";
import {
	NON_TEST_DATABASE_OVERRIDE,
	validateDatabaseTestEnvironment,
} from "../testSupport/databaseSafety.js";

const SAFE_URI = "mongodb://127.0.0.1:27017";

test("database integration safety requires explicit connection settings", () => {
	assert.throws(() => validateDatabaseTestEnvironment({}), /MONGODB_URI is required/);
	assert.throws(
		() => validateDatabaseTestEnvironment({ MONGODB_URI: SAFE_URI }),
		/DB_NAME is required/,
	);
});

test("database integration safety rejects the production database even with an override", () => {
	assert.throws(
		() => validateDatabaseTestEnvironment({
			MONGODB_URI: SAFE_URI,
			DB_NAME: "music-journal",
			ALLOW_NON_TEST_DB_NAME: NON_TEST_DATABASE_OVERRIDE,
		}),
		/Refusing to run database tests against the production database/,
	);
});

test("database integration safety prefers test names and requires an explicit advanced override", () => {
	assert.deepEqual(
		validateDatabaseTestEnvironment({
			MONGODB_URI: SAFE_URI,
			DB_NAME: "music-journal-test",
		}),
		{ databaseName: "music-journal-test", mongoUri: SAFE_URI },
	);

	assert.throws(
		() => validateDatabaseTestEnvironment({
			MONGODB_URI: SAFE_URI,
			DB_NAME: "disposable-journal",
		}),
		/DB_NAME must contain test/,
	);

	assert.equal(
		validateDatabaseTestEnvironment({
			MONGODB_URI: SAFE_URI,
			DB_NAME: "disposable-journal",
			ALLOW_NON_TEST_DB_NAME: NON_TEST_DATABASE_OVERRIDE,
		}).databaseName,
		"disposable-journal",
	);
});

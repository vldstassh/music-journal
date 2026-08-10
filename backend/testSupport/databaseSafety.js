export const NON_TEST_DATABASE_OVERRIDE = "I_UNDERSTAND_THIS_TEST_WRITES_AND_DELETES_DATA";

export function validateDatabaseTestEnvironment(environment = process.env) {
	const mongoUri = environment.MONGODB_URI?.trim();
	const databaseName = environment.DB_NAME?.trim();

	if (!mongoUri) {
		throw new Error("MONGODB_URI is required when RUN_DB_TESTS=1");
	}

	if (!databaseName) {
		throw new Error("DB_NAME is required when RUN_DB_TESTS=1");
	}

	if (databaseName.toLowerCase() === "music-journal") {
		throw new Error("Refusing to run database tests against the production database music-journal");
	}

	if (!databaseName.toLowerCase().includes("test")
		&& environment.ALLOW_NON_TEST_DB_NAME !== NON_TEST_DATABASE_OVERRIDE) {
		throw new Error(
			"DB_NAME must contain test; set the documented advanced override only for an isolated disposable database",
		);
	}

	return { databaseName, mongoUri };
}

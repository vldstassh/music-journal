import test from "node:test";
import assert from "node:assert/strict";
import {
	readRuntimeConfig,
	SESSION_COLLECTION_NAME,
	SESSION_TTL_SECONDS,
} from "../runtime.js";

const MANAGED_VARIABLES = [
	"NODE_ENV",
	"PORT",
	"SESSION_SECRET",
	"SESSION_STORE",
	"DB_NAME",
];

function withEnvironment(values, run) {
	const originalValues = Object.fromEntries(
		MANAGED_VARIABLES.map((name) => [name, process.env[name]]),
	);

	for (const name of MANAGED_VARIABLES) {
		delete process.env[name];
	}
	Object.assign(process.env, values);

	try {
		return run();
	} finally {
		for (const name of MANAGED_VARIABLES) {
			if (originalValues[name] === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = originalValues[name];
			}
		}
	}
}

test("production runtime requires a persistent database and strong session secret", () => {
	withEnvironment({
		NODE_ENV: "production",
		DB_NAME: "music-journal",
		SESSION_SECRET: "a".repeat(32),
		SESSION_STORE: "memory",
	}, () => {
		const config = readRuntimeConfig();

		assert.equal(config.isProduction, true);
		assert.equal(config.databaseName, "music-journal");
		assert.equal(config.useMemorySessionStore, false);
		assert.equal(config.port, 3000);
	});
});

test("production runtime rejects a weak session secret", () => {
	withEnvironment({
		NODE_ENV: "production",
		DB_NAME: "music-journal",
		SESSION_SECRET: "too-short",
	}, () => {
		assert.throws(
			() => readRuntimeConfig(),
			/SESSION_SECRET must contain at least 32 characters in production/,
		);
	});
});

test("session storage constants preserve the production contract", () => {
	assert.equal(SESSION_COLLECTION_NAME, "sessions_v2");
	assert.equal(SESSION_TTL_SECONDS, 60 * 60 * 24 * 7);
});

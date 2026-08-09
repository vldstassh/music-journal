import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../createApp.js";

async function withServer(run) {
	const server = createApp({ sessionSecret: "integration-test-secret" }).listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();

	try {
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		server.close();
		await once(server, "close");
	}
}

test("health endpoint and static frontend are available", async () => {
	await withServer(async (baseUrl) => {
		const healthResponse = await fetch(`${baseUrl}/api/health`);
		assert.equal(healthResponse.status, 200);
		assert.deepEqual(await healthResponse.json(), { status: "ok" });
		assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");

		const frontendResponse = await fetch(baseUrl);
		assert.equal(frontendResponse.status, 200);
		assert.match(await frontendResponse.text(), /<title>Music Journal<\/title>/);
	});
});

test("protected and unknown API endpoints return structured errors", async () => {
	await withServer(async (baseUrl) => {
		const protectedResponse = await fetch(`${baseUrl}/api/moods`);
		assert.equal(protectedResponse.status, 401);
		assert.deepEqual(await protectedResponse.json(), { error: "Authentication required" });

		const missingResponse = await fetch(`${baseUrl}/api/missing`);
		assert.equal(missingResponse.status, 404);
		assert.deepEqual(await missingResponse.json(), { error: "API endpoint not found" });
	});
});

test("invalid JSON and invalid signup input fail without touching the database", async () => {
	await withServer(async (baseUrl) => {
		const invalidJsonResponse = await fetch(`${baseUrl}/api/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		assert.equal(invalidJsonResponse.status, 400);
		assert.deepEqual(await invalidJsonResponse.json(), { error: "Request body must contain valid JSON" });

		const signupResponse = await fetch(`${baseUrl}/api/signup`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "invalid", password: "short" }),
		});
		assert.equal(signupResponse.status, 400);
		assert.deepEqual(await signupResponse.json(), { error: "Enter a valid email address" });
	});
});

test("rejects requests from untrusted browser origins", async () => {
	await withServer(async (baseUrl) => {
		const response = await fetch(`${baseUrl}/api/logout`, {
			method: "POST",
			headers: { Origin: "https://malicious.example" },
		});

		assert.equal(response.status, 403);
		assert.deepEqual(await response.json(), { error: "Origin not allowed" });
	});
});

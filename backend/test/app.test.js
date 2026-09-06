import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../createApp.js";
import { createAuthRateLimiter } from "../middleware/authRateLimit.js";

async function withServer(run, options = {}) {
	const server = createApp({
		sessionSecret: "integration-test-secret",
		...options,
	}).listen(0, "127.0.0.1");
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
		assert.equal(healthResponse.headers.get("cache-control"), "no-store");
		assert.match(healthResponse.headers.get("content-security-policy"), /default-src 'self'/);
		assert.equal(healthResponse.headers.get("cross-origin-opener-policy"), "same-origin");
		assert.equal(healthResponse.headers.get("x-content-type-options"), "nosniff");

		const frontendResponse = await fetch(baseUrl);
		assert.equal(frontendResponse.status, 200);
		const frontendHtml = await frontendResponse.text();
		assert.match(frontendHtml, /<title>Music Journal<\/title>/);
		assert.match(frontendHtml, /class="deletebutton" type="button"/);
		assert.match(frontendHtml, /class="editbutton" type="button"/);
		assert.match(frontendHtml, /id="cancelEditButton" type="button"/);
		assert.doesNotMatch(frontendHtml, /\sstyle=/);

		const statsResponse = await fetch(`${baseUrl}/stats.html`);
		assert.equal(statsResponse.status, 200);
		const statsHtml = await statsResponse.text();
		assert.match(statsHtml, /<title>Statistics \| Music Journal<\/title>/);
		assert.doesNotMatch(statsHtml, /\sstyle=/);
		assert.ok(statsHtml.indexOf('src="config.js"') < statsHtml.indexOf('src="stats.js"'));

		const statsModuleResponse = await fetch(`${baseUrl}/statsData.js`);
		assert.equal(statsModuleResponse.status, 200);
		assert.match(await statsModuleResponse.text(), /export function summarizeEntries/);
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

		const oversizedLoginResponse = await fetch(`${baseUrl}/api/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: "person@example.com",
				password: "🔐".repeat(19),
			}),
		});
		assert.equal(oversizedLoginResponse.status, 400);
		assert.deepEqual(await oversizedLoginResponse.json(), {
			error: "Password must be 72 UTF-8 bytes or fewer",
		});
	});
});

test("rate limits repeated signup and login attempts from the same client", async () => {
	const authRateLimiter = createAuthRateLimiter({ limit: 2, windowMs: 60_000 });

	await withServer(async (baseUrl) => {
		for (const path of ["/api/login", "/api/signup"]) {
			const response = await fetch(`${baseUrl}${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: "invalid", password: "not-a-valid-password" }),
			});

			assert.equal(response.status, 400);
			assert.ok(response.headers.has("ratelimit"));
			assert.match(response.headers.get("ratelimit-policy"), /authentication/);
		}

		const blockedResponse = await fetch(`${baseUrl}/api/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "invalid", password: "not-a-valid-password" }),
		});

		assert.equal(blockedResponse.status, 429);
		assert.deepEqual(await blockedResponse.json(), {
			error: "Too many authentication attempts. Try again later.",
		});
		assert.ok(blockedResponse.headers.has("retry-after"));
	}, { authRateLimiter });
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

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { createApp } from "../app.js";
import { closeDB, connectDB } from "../connection/connection.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

function getSessionCookie(response) {
	const setCookie = response.headers.get("set-cookie");
	return setCookie ? setCookie.split(";", 1)[0] : "";
}

async function jsonRequest(baseUrl, path, { cookie, ...options } = {}) {
	const headers = new Headers(options.headers);
	if (cookie) {
		headers.set("Cookie", cookie);
	}

	const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
	const payload = response.status === 204 ? null : await response.json();
	return { response, payload };
}

test("complete authenticated journal flow against MongoDB", { skip: !shouldRun }, async (context) => {
	assert.ok(process.env.MONGODB_URI, "MONGODB_URI is required when RUN_DB_TESTS=1");
	assert.ok(process.env.DB_NAME, "DB_NAME is required when RUN_DB_TESTS=1");

	const email = `music-journal-e2e-${randomUUID()}@example.invalid`;
	const password = `Test-${randomUUID()}`;
	const clientId = `e2e-${randomUUID()}`;
	const app = createApp({ sessionSecret: "database-integration-test-secret" });
	const server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;
	let userId;

	context.after(async () => {
		server.close();
		await once(server, "close");

		try {
			const db = await connectDB();
			const user = userId
				? { _id: new ObjectId(userId) }
				: await db.collection("users").findOne({ email });

			if (user) {
				await db.collection("moods").deleteMany({
					userId: { $in: [user._id.toString(), user._id] },
				});
				await db.collection("users").deleteOne({ _id: user._id });
			}
		} finally {
			await closeDB();
		}
	});

	const signup = await jsonRequest(baseUrl, "/api/signup", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	assert.equal(signup.response.status, 201);
	assert.equal(signup.payload.user.email, email);
	userId = signup.payload.user.id;
	const cookie = getSessionCookie(signup.response);
	assert.match(cookie, /^music-journal\.sid=/);

	const moodBody = JSON.stringify({
		clientId,
		mood: "Focused",
		intensity: 8,
		songTitle: "Integration Test Song",
		artist: "Music Journal",
		songLink: "https://example.com/song",
		note: "Created by the live database test.",
	});
	const firstCreate = await jsonRequest(baseUrl, "/api/moods", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: moodBody,
		cookie,
	});
	assert.equal(firstCreate.response.status, 201);
	assert.equal(firstCreate.payload.data.clientId, clientId);
	assert.equal(firstCreate.payload.data.userId, undefined);

	const retryCreate = await jsonRequest(baseUrl, "/api/moods", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: moodBody,
		cookie,
	});
	assert.equal(retryCreate.response.status, 201);
	assert.equal(retryCreate.payload.data._id, firstCreate.payload.data._id);

	const moods = await jsonRequest(baseUrl, "/api/moods", { cookie });
	assert.equal(moods.response.status, 200);
	assert.equal(moods.payload.data.length, 1);
	assert.equal(moods.payload.data[0].songTitle, "Integration Test Song");

	const logout = await jsonRequest(baseUrl, "/api/logout", { method: "POST", cookie });
	assert.equal(logout.response.status, 204);

	const signedOutUser = await jsonRequest(baseUrl, "/api/user", { cookie });
	assert.equal(signedOutUser.response.status, 401);
});

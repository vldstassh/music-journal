import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { closeDB, connectDB } from "../connection/connection.js";
import {
	createConfiguredApp,
	SESSION_COLLECTION_NAME,
} from "../runtime.js";
import { validateDatabaseTestEnvironment } from "../testSupport/databaseSafety.js";

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

function deserializeStoredSession(document) {
	if (!document) {
		return null;
	}

	try {
		return typeof document.session === "string"
			? JSON.parse(document.session)
			: document.session;
	} catch {
		return null;
	}
}

async function waitFor(check, failureMessage) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const result = await check();
		if (result) {
			return result;
		}

		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	assert.fail(failureMessage);
}

test("configured app persists authenticated sessions in sessions_v2", { skip: !shouldRun }, async (context) => {
	validateDatabaseTestEnvironment();

	const email = `music-journal-e2e-${randomUUID()}@example.invalid`;
	const password = `Test-${randomUUID()}`;
	const clientId = `e2e-${randomUUID()}`;
	const originalNodeEnvironment = process.env.NODE_ENV;
	const originalSessionSecret = process.env.SESSION_SECRET;
	process.env.NODE_ENV = "test";
	process.env.SESSION_SECRET = "database-integration-test-secret-32-characters";
	let server;
	let userId;
	let sessionDocumentId;

	context.after(async () => {
		if (server?.listening) {
			server.close();
			await once(server, "close");
		}

		try {
			const db = await connectDB();
			const user = await db.collection("users").findOne({ email });
			const testUserId = userId || user?._id.toString();

			if (testUserId) {
				const sessionDocuments = await db.collection(SESSION_COLLECTION_NAME).find({}).toArray();
				const sessionIds = sessionDocuments
					.filter((document) => deserializeStoredSession(document)?.userId === testUserId)
					.map((document) => document._id);

				if (sessionDocumentId !== undefined) {
					sessionIds.push(sessionDocumentId);
				}

				if (sessionIds.length) {
					await db.collection(SESSION_COLLECTION_NAME).deleteMany({
						_id: { $in: [...new Set(sessionIds)] },
					});
				}
			}

			if (user) {
				await db.collection("moods").deleteMany({
					userId: { $in: [user._id.toString(), user._id] },
				});
				await db.collection("users").deleteOne({ _id: user._id });
			}
		} finally {
			try {
				await closeDB();
			} finally {
				if (originalNodeEnvironment === undefined) {
					delete process.env.NODE_ENV;
				} else {
					process.env.NODE_ENV = originalNodeEnvironment;
				}

				if (originalSessionSecret === undefined) {
					delete process.env.SESSION_SECRET;
				} else {
					process.env.SESSION_SECRET = originalSessionSecret;
				}
			}
		}
	});

	const { app } = await createConfiguredApp();
	server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;

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

	const currentUser = await jsonRequest(baseUrl, "/api/user", { cookie });
	assert.equal(currentUser.response.status, 200);
	assert.deepEqual(currentUser.payload.user, { id: userId, email });

	const db = await connectDB();
	const sessions = db.collection(SESSION_COLLECTION_NAME);
	const storedSession = await waitFor(async () => {
		const documents = await sessions.find({}).toArray();
		return documents.find((document) => deserializeStoredSession(document)?.userId === userId);
	}, "Expected the authenticated session in sessions_v2");
	const storedSessionPayload = deserializeStoredSession(storedSession);
	sessionDocumentId = storedSession._id;
	assert.equal(storedSessionPayload.userId, userId);
	assert.ok(storedSession.expires instanceof Date);

	const expiryIndex = (await sessions.indexes()).find((index) => (
		index.key?.expires === 1 && index.expireAfterSeconds === 0
	));
	assert.ok(expiryIndex, "sessions_v2 must have a TTL index on expires");

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

	for (const loginEmail of [email, `missing-${email}`]) {
		const rejectedLogin = await jsonRequest(baseUrl, "/api/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: loginEmail, password: "definitely-incorrect" }),
		});
		assert.equal(rejectedLogin.response.status, 401);
		assert.deepEqual(rejectedLogin.payload, { error: "Invalid email or password" });
	}

	const logout = await jsonRequest(baseUrl, "/api/logout", { method: "POST", cookie });
	assert.equal(logout.response.status, 204);
	await waitFor(
		async () => (await sessions.findOne({ _id: sessionDocumentId })) === null,
		"Expected logout to delete the sessions_v2 document",
	);

	const signedOutUser = await jsonRequest(baseUrl, "/api/user", { cookie });
	assert.equal(signedOutUser.response.status, 401);
});

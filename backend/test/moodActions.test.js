import test, { before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { once } from "node:events";
import { promisify } from "node:util";
import { MongoClient, ObjectId } from "mongodb";
import session from "express-session";
import { createApp } from "../createApp.js";
import { closeDB } from "../connection/connection.js";

const ownerId = new ObjectId();
const otherUserId = new ObjectId();
const secret = "mood-action-http-test-secret";
const originalEnvironment = { MONGODB_URI: process.env.MONGODB_URI, DB_NAME: process.env.DB_NAME };
const originalDate = new Date("2026-08-10T12:00:00Z");
const body = {
	mood: "Calm", intensity: 3, songTitle: "Updated song", artist: "Updated artist",
	songLink: "https://example.com/updated", note: "Updated note",
};
let documents;
let calls;

// Exercise the real routes, controllers and model queries without a live database.
// BSON equality deliberately distinguishes string IDs from ObjectIds.
function sameId(left, right) {
	return left instanceof ObjectId && right instanceof ObjectId
		? left.equals(right)
		: left === right;
}

function matches(document, filter) {
	return Object.entries(filter).every(([key, value]) => (
		value?.$in
			? value.$in.some((candidate) => sameId(document[key], candidate))
			: sameId(document[key], value)
	));
}

const collection = {
	async createIndex() {},
	find(filter) {
		return { sort: () => ({ toArray: async () => documents.filter((doc) => matches(doc, filter)) }) };
	},
	async findOneAndUpdate(filter, update, options) {
		calls.push({ filter, update, options });
		assert.equal(options.returnDocument, "after");
		assert.equal(options.includeResultMetadata, false);
		assert.deepEqual(Object.keys(update.$set).sort(), Object.keys(body).sort());
		const document = documents.find((doc) => matches(doc, filter));
		return document ? Object.assign(document, update.$set) : null;
	},
	async deleteMany(filter) {
		calls.push({ filter });
		const beforeCount = documents.length;
		documents = documents.filter((doc) => !matches(doc, filter));
		return { acknowledged: true, deletedCount: beforeCount - documents.length };
	},
};

before(() => {
	process.env.MONGODB_URI = "mongodb://127.0.0.1:1";
	process.env.DB_NAME = "music-journal-unit-test";
	mock.method(MongoClient.prototype, "connect", async function () { return this; });
	mock.method(MongoClient.prototype, "db", () => ({ collection: () => collection }));
	mock.method(MongoClient.prototype, "close", async () => {});
});

beforeEach(() => { documents = []; calls = []; });

after(async () => {
	await closeDB();
	mock.restoreAll();
	for (const [key, value] of Object.entries(originalEnvironment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

function moodDocument(id, userId = ownerId.toString()) {
	return {
		_id: id, userId, clientId: "original-client-id", createdAt: originalDate,
		mood: "Joyful", intensity: 8, songTitle: "Original song", artist: "Original artist",
		songLink: "https://example.com/original", note: "Original note",
	};
}

async function withApi(run) {
	const store = new session.MemoryStore();
	const sessionId = "owner-session";
	await promisify(store.set).call(store, sessionId, {
		userId: ownerId.toString(),
		cookie: { originalMaxAge: 60_000, expires: new Date(Date.now() + 60_000), httpOnly: true, path: "/" },
	});
	const signature = createHmac("sha256", secret).update(sessionId).digest("base64").replace(/=+$/, "");
	const cookie = `music-journal.sid=${encodeURIComponent(`s:${sessionId}.${signature}`)}`;
	const server = createApp({ sessionStore: store, sessionSecret: secret, allowedOrigins: [] })
		.listen(0, "127.0.0.1");
	await once(server, "listening");
	try {
		await run(async (path, { method = "GET", data, authenticated = true } = {}) => {
			const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
				method,
				headers: { "Content-Type": "application/json", ...(authenticated ? { Cookie: cookie } : {}) },
				body: data === undefined ? undefined : JSON.stringify(data),
			});
			return { status: response.status, payload: await response.json() };
		});
	} finally {
		server.close();
		await once(server, "close");
	}
}

for (const [kind, id] of [
	["client string", "client:current-id"],
	["legacy ObjectId", new ObjectId()],
	["hex string", new ObjectId().toString()],
]) {
	for (const userId of [ownerId.toString(), ownerId]) {
		test(`edits and deletes ${kind} entries with ${typeof userId} ownership`, async () => {
			documents.push(moodDocument(id, userId));
			await withApi(async (request) => {
				const edited = await request(`/api/moods/${encodeURIComponent(id.toString())}`, {
					method: "PUT", data: { ...body, userId: otherUserId.toString(), clientId: "replacement", createdAt: "2026-09-06" },
				});
				assert.equal(edited.status, 200);
				assert.deepEqual(edited.payload.data, {
					...body, _id: id.toString(), clientId: "original-client-id", createdAt: originalDate.toISOString(),
				});
				const listed = await request("/api/moods");
				assert.deepEqual(listed.payload.data, [edited.payload.data]);
				const deleted = await request("/api/moods/delete_that_song", { method: "DELETE", data: { moodIds: [id.toString()] } });
				assert.equal(deleted.status, 200);
				assert.equal(deleted.payload.deletedCount, 1);
				assert.deepEqual((await request("/api/moods")).payload.data, []);
				assert.equal((await request("/api/moods/delete_that_song", { method: "DELETE", data: { moodIds: [id.toString()] } })).status, 404);
			});
		});
	}
}

test("edit and single-ID delete return 404 for missing or non-owned entries", async () => {
	documents.push(moodDocument("client:foreign", otherUserId), moodDocument(new ObjectId(), otherUserId.toString()));
	const beforeDocuments = JSON.stringify(documents);
	await withApi(async (request) => {
		for (const id of [...documents.map((doc) => doc._id.toString()), "client:missing", new ObjectId().toString()]) {
			for (const [path, method, data] of [
				[`/api/moods/${id}`, "PUT", body],
				["/api/moods/delete_that_song", "DELETE", { moodIds: [id] }],
			]) {
				const result = await request(path, { method, data });
				assert.equal(result.status, 404);
				assert.deepEqual(result.payload, { error: "Entry not found" });
			}
		}
	});
	assert.equal(JSON.stringify(documents), beforeDocuments);
});

test("mutation routes require a session and validate input before database access", async () => {
	await withApi(async (request) => {
		for (const [path, method, data] of [
			["/api/moods/client:entry", "PUT", body],
			["/api/moods/delete_that_song", "DELETE", { moodIds: ["client:entry"] }],
		]) {
			assert.equal((await request(path, { method, data, authenticated: false })).status, 401);
		}
		assert.equal((await request("/api/moods/client:entry", { method: "PUT", data: { ...body, intensity: 11 } })).status, 400);
		for (const moodIds of [[], [null], [123], [{}], [" "], "client:entry"]) {
			assert.equal((await request("/api/moods/delete_that_song", { method: "DELETE", data: { moodIds } })).status, 400);
		}
	});
	assert.equal(calls.length, 0);
});

test("bulk deletion retains compatibility and cannot delete another user's records", async () => {
	documents.push(moodDocument("client:own"), moodDocument("client:other", otherUserId));
	await withApi(async (request) => {
		const result = await request("/api/moods/delete_that_song", { method: "DELETE", data: { moodIds: ["client:own", "client:other"] } });
		assert.equal(result.status, 200);
		assert.equal(result.payload.deletedCount, 1);
	});
	assert.equal(documents.length, 1);
	assert.equal(documents[0]._id, "client:other");
});

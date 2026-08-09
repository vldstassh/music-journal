import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { connectMongoClient, getDbName } from "./connection/connection.js";
import { summarizeError } from "./lib/logging.js";

dotenv.config({ quiet: true });

export const SESSION_COLLECTION_NAME = "sessions_v2";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function readRuntimeConfig() {
	const isProduction = process.env.NODE_ENV === "production";
	const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
	const sessionSecret = process.env.SESSION_SECRET
		|| (isProduction ? "" : "dev-session-secret-change-me");
	const useMemorySessionStore = process.env.SESSION_STORE === "memory" && !isProduction;

	if (!Number.isInteger(port) || port < 0 || port > 65_535) {
		throw new Error("PORT must be an integer between 0 and 65535");
	}

	if (!sessionSecret || (isProduction && sessionSecret.length < 32)) {
		throw new Error("SESSION_SECRET must contain at least 32 characters in production");
	}

	const databaseName = useMemorySessionStore ? undefined : getDbName();
	return { databaseName, isProduction, port, sessionSecret, useMemorySessionStore };
}

function createMongoSessionStore(client, databaseName) {
	const sessionStore = MongoStore.create({
		clientPromise: Promise.resolve(client),
		dbName: databaseName,
		collectionName: SESSION_COLLECTION_NAME,
		ttl: SESSION_TTL_SECONDS,
	});

	sessionStore.on("error", (error) => {
		console.error("Session store error:", summarizeError(error));
	});

	return sessionStore;
}

export async function createConfiguredApp({ application } = {}) {
	const config = readRuntimeConfig();
	let sessionStore;

	if (!config.useMemorySessionStore) {
		const client = await connectMongoClient();
		sessionStore = createMongoSessionStore(client, config.databaseName);
	}

	const app = createApp({
		application,
		sessionStore,
		sessionSecret: config.sessionSecret,
		isProduction: config.isProduction,
	});

	return { app, config };
}

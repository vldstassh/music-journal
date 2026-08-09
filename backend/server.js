import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { closeDB, connectMongoClient, getDbName } from "./connection/connection.js";

dotenv.config({ quiet: true });

const isProduction = process.env.NODE_ENV === "production";
const configuredPort = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "dev-session-secret-change-me");
const useMemorySessionStore = process.env.SESSION_STORE === "memory" && !isProduction;

if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65_535) {
	throw new Error("PORT must be an integer between 0 and 65535");
}

if (!sessionSecret || (isProduction && sessionSecret.length < 32)) {
	throw new Error("SESSION_SECRET must contain at least 32 characters in production");
}

if (!process.env.SESSION_SECRET) {
	console.warn("Using the development session secret; set SESSION_SECRET before sharing this server");
}

if (useMemorySessionStore) {
	console.warn("Using the in-memory session store; sessions will not survive a restart");
}

const sessionStore = useMemorySessionStore
	? undefined
	: MongoStore.create({
			clientPromise: connectMongoClient(),
			dbName: getDbName(),
			collectionName: "sessions_v2",
			ttl: 60 * 60 * 24 * 7,
		});

if (sessionStore) {
	sessionStore.on("error", (error) => {
		console.error("Session store error:", error);
	});
}

const app = createApp({ sessionStore, sessionSecret, isProduction });
const httpServer = app.listen(configuredPort, () => {
	console.log(`Music Journal listening on port ${configuredPort}`);
});

let isShuttingDown = false;

async function shutdown(signal) {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;
	console.log(`${signal} received; shutting down`);
	const forceShutdownTimer = setTimeout(() => {
		console.error("Graceful shutdown timed out; closing remaining connections");
		httpServer.closeAllConnections();
	}, 10_000);
	forceShutdownTimer.unref();

	httpServer.close(async () => {
		clearTimeout(forceShutdownTimer);
		try {
			await closeDB();
		} catch (databaseError) {
			console.error("Database shutdown failed:", databaseError);
			process.exitCode = 1;
		}
	});
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

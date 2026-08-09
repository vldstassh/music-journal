import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { closeDB, connectMongoClient, getDbName } from "./connection/connection.js";
import { summarizeError } from "./lib/logging.js";

dotenv.config({ quiet: true });

function readRuntimeConfig() {
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

async function startServer() {
	let config;
	try {
		config = readRuntimeConfig();
	} catch (error) {
		const message = error instanceof Error ? error.message : "Invalid runtime configuration";
		console.error(`Configuration error: ${message}`);
		process.exitCode = 1;
		return;
	}

	if (!process.env.SESSION_SECRET) {
		console.warn("Using the development session secret; set SESSION_SECRET before sharing this server");
	}

	if (config.useMemorySessionStore) {
		console.warn("Using the in-memory session store; sessions will not survive a restart");
	}

	let sessionStore;
	if (!config.useMemorySessionStore) {
		try {
			const connectedClient = await connectMongoClient();
			console.log("MongoDB connection established");
			sessionStore = MongoStore.create({
				clientPromise: Promise.resolve(connectedClient),
				dbName: config.databaseName,
				collectionName: "sessions_v2",
				ttl: 60 * 60 * 24 * 7,
			});
		} catch (error) {
			console.error(
				`MongoDB startup failed: ${summarizeError(error)}. Check MONGODB_URI, DB_NAME, Atlas permissions, and network access.`,
			);
			try {
				await closeDB();
			} catch (databaseError) {
				console.error("Database cleanup failed:", summarizeError(databaseError));
			}
			process.exitCode = 1;
			return;
		}
	}

	if (sessionStore) {
		sessionStore.on("error", (error) => {
			console.error("Session store error:", summarizeError(error));
		});
	}

	let app;
	try {
		app = createApp({
			sessionStore,
			sessionSecret: config.sessionSecret,
			isProduction: config.isProduction,
		});
	} catch (error) {
		console.error(
			`Application configuration failed: ${summarizeError(error)}. Check CORS_ORIGIN and COOKIE_SAMESITE.`,
		);
		await closeDB();
		process.exitCode = 1;
		return;
	}

	const httpServer = app.listen(config.port, "0.0.0.0", () => {
		const address = httpServer.address();
		const listeningPort = typeof address === "object" && address ? address.port : config.port;
		console.log(`Music Journal listening on 0.0.0.0:${listeningPort}`);
	});

	httpServer.on("error", async (error) => {
		console.error("HTTP server error:", summarizeError(error));
		if (httpServer.listening) {
			httpServer.closeAllConnections();
			httpServer.close();
		}
		try {
			await closeDB();
		} catch (databaseError) {
			console.error("Database shutdown failed:", summarizeError(databaseError));
		}
		process.exitCode = 1;
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
				console.error("Database shutdown failed:", summarizeError(databaseError));
				process.exitCode = 1;
			}
		});
	}

	process.once("SIGINT", () => shutdown("SIGINT"));
	process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
	console.error("Unexpected startup failure:", summarizeError(error));
	process.exitCode = 1;
});

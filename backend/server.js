import { closeDB } from "./connection/connection.js";
import { summarizeError } from "./lib/logging.js";
import { createConfiguredApp } from "./runtime.js";

async function startServer() {
	let app;
	let config;
	try {
		({ app, config } = await createConfiguredApp());
	} catch (error) {
		console.error(
			`Application startup failed: ${summarizeError(error)}. Check MONGODB_URI, DB_NAME, SESSION_SECRET, CORS_ORIGIN, COOKIE_SAMESITE, and Atlas network access.`,
		);
		try {
			await closeDB();
		} catch (databaseError) {
			console.error("Database cleanup failed:", summarizeError(databaseError));
		}
		process.exitCode = 1;
		return;
	}

	if (!process.env.SESSION_SECRET) {
		console.warn("Using the development session secret; set SESSION_SECRET before sharing this server");
	}

	if (config.useMemorySessionStore) {
		console.warn("Using the in-memory session store; sessions will not survive a restart");
	}

	if (!config.useMemorySessionStore) {
		console.log("MongoDB connection established");
	}

	const httpServer = app.listen(config.port, "0.0.0.0", () => {
		const address = httpServer.address();
		const listeningPort = typeof address === "object" && address ? address.port : config.port;
		console.log(`Music Journal listening att http://localhost:${listeningPort}`);
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

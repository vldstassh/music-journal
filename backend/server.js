import express from "express";
import session from "express-session";
import connectMongoDBSession from "connect-mongodb-session";
import dotenv from "dotenv";
import authRoutes from "./routes/authRouter.js";
import moodRoutes from "./routes/moodRoutes.js";
import { getDbName, getMongoUrl } from "./connection/connection.js";

dotenv.config({ quiet: true });

const server = express();
const MongoDBStore = connectMongoDBSession(session);
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "dev_session_secret");
const useMemorySessionStore = process.env.SESSION_STORE === "memory" && !isProduction;
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || "")
	.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

if (!sessionSecret) {
	throw new Error("Missing SESSION_SECRET environment variable");
}

const store = useMemorySessionStore
	? undefined
	: new MongoDBStore({
			uri: getMongoUrl(),
			databaseName: getDbName(),
			collection: "sessions",
		});

if (store) {
	store.on("error", (error) => {
		console.error("Session store error:", error);
	});
}

function setCorsHeaders(req, res, next) {
	const origin = req.headers.origin;

	if (origin && (allowedOrigins.includes(origin) || (!isProduction && allowedOrigins.length === 0))) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Access-Control-Allow-Credentials", "true");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
		res.setHeader("Vary", "Origin");
	}

	if (req.method === "OPTIONS") {
		return res.sendStatus(204);
	}

	return next();
}

server.set("trust proxy", 1);

server.use(express.json());
server.use(setCorsHeaders);
server.get("/api/health", (req, res) => {
	res.status(200).json({ status: "ok" });
});
server.use(
	session({
		secret: sessionSecret,
		resave: false,
		saveUninitialized: false,
		store,
		cookie: {
			httpOnly: true,
			secure: isProduction,
			sameSite: process.env.COOKIE_SAMESITE || (isProduction ? "none" : "lax"),
			maxAge: 1000 * 60 * 60 * 24 * 7,
		},
	}),
);

server.use("/api", authRoutes);
server.use("/api", moodRoutes);

server.listen(port, () => {
	console.log(`Server running on port ${port}`);
});

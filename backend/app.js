import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import session from "express-session";
import authRoutes from "./routes/authRouter.js";
import moodRoutes from "./routes/moodRoutes.js";
import { SESSION_COOKIE_NAME } from "./controllers/authController.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(currentDirectory, "../public");
const VALID_SAME_SITE_VALUES = new Set(["lax", "strict", "none"]);

function parseAllowedOrigins(value) {
	return (value || "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean)
		.map((origin) => {
			const parsedOrigin = new URL(origin);
			if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
				throw new Error("CORS_ORIGIN values must use http or https");
			}
			return parsedOrigin.origin;
		});
}

function createCorsMiddleware(allowedOrigins) {
	return function setCorsHeaders(req, res, next) {
		const origin = req.headers.origin;
		const requestOrigin = `${req.protocol}://${req.get("host")}`;
		const isAllowedOrigin = origin && (origin === requestOrigin || allowedOrigins.includes(origin));

		res.append("Vary", "Origin");

		if (origin && !isAllowedOrigin) {
			return res.status(403).json({ error: "Origin not allowed" });
		}

		if (isAllowedOrigin) {
			res.setHeader("Access-Control-Allow-Origin", origin);
			res.setHeader("Access-Control-Allow-Credentials", "true");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
			res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
		}

		if (req.method === "OPTIONS") {
			return res.sendStatus(204);
		}

		return next();
	};
}

function setSecurityHeaders(_req, res, next) {
	res.setHeader("Referrer-Policy", "same-origin");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
	return next();
}

export function createApp({
	sessionStore,
	sessionSecret = "test-session-secret",
	isProduction = false,
	allowedOrigins = parseAllowedOrigins(process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN),
	cookieSameSite = process.env.COOKIE_SAMESITE || "lax",
} = {}) {
	if (!VALID_SAME_SITE_VALUES.has(cookieSameSite)) {
		throw new Error("COOKIE_SAMESITE must be lax, strict, or none");
	}

	const app = express();
	app.disable("x-powered-by");
	app.set("trust proxy", isProduction ? 1 : false);
	app.use(setSecurityHeaders);
	app.use(createCorsMiddleware(allowedOrigins));
	app.use(express.json({ limit: "32kb" }));

	app.get("/api/health", (_req, res) => {
		res.status(200).json({ status: "ok" });
	});

	app.use(session({
		name: SESSION_COOKIE_NAME,
		secret: sessionSecret,
		resave: false,
		saveUninitialized: false,
		store: sessionStore,
		cookie: {
			httpOnly: true,
			secure: isProduction,
			sameSite: cookieSameSite,
			maxAge: 1000 * 60 * 60 * 24 * 7,
		},
	}));

	app.use("/api", authRoutes);
	app.use("/api", moodRoutes);
	app.use(express.static(publicDirectory, {
		dotfiles: "deny",
		fallthrough: true,
		index: "index.html",
		maxAge: isProduction ? "1h" : 0,
	}));

	app.use((req, res) => {
		if (req.path.startsWith("/api/")) {
			return res.status(404).json({ error: "API endpoint not found" });
		}

		return res.status(404).type("text").send("Not found");
	});

	app.use((error, _req, res, _next) => {
		if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
			return res.status(400).json({ error: "Request body must contain valid JSON" });
		}

		console.error("Unhandled request error:", error);
		return res.status(500).json({ error: "Internal server error" });
	});

	return app;
}

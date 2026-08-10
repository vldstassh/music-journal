import { rateLimit } from "express-rate-limit";

export const AUTH_RATE_LIMIT = 10;
export const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function createAuthRateLimiter({
	limit = AUTH_RATE_LIMIT,
	windowMs = AUTH_RATE_LIMIT_WINDOW_MS,
} = {}) {
	return rateLimit({
		identifier: "authentication",
		legacyHeaders: false,
		limit,
		message: { error: "Too many authentication attempts. Try again later." },
		skip: (req) => req.method !== "POST",
		standardHeaders: "draft-8",
		windowMs,
	});
}

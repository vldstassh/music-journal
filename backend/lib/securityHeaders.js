export const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"base-uri 'self'",
	"connect-src 'self'",
	"font-src 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
	"img-src 'self' data:",
	"object-src 'none'",
	"script-src 'self'",
	"style-src 'self'",
].join("; ");

export const SECURITY_HEADERS = Object.freeze({
	"Content-Security-Policy": CONTENT_SECURITY_POLICY,
	"Cross-Origin-Opener-Policy": "same-origin",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Referrer-Policy": "same-origin",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
});

export function setSecurityHeaders(_req, res, next) {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		res.setHeader(name, value);
	}

	return next();
}

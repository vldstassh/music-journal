export function summarizeError(error) {
	if (!(error instanceof Error)) {
		return "UnknownError";
	}

	const name = String(error.name || "Error")
		.replace(/[^a-zA-Z0-9_.-]/g, "")
		.slice(0, 80) || "Error";
	const code = typeof error.code === "string" || typeof error.code === "number"
		? String(error.code).replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80)
		: "";

	return code ? `${name} (${code})` : name;
}

import test from "node:test";
import assert from "node:assert/strict";
import { summarizeError } from "../lib/logging.js";

test("error summaries include operational identifiers without logging messages", () => {
	const error = new Error("mongodb+srv://user:secret@example.invalid");
	error.name = "MongoServerSelectionError";
	error.code = "ETIMEDOUT";

	assert.equal(summarizeError(error), "MongoServerSelectionError (ETIMEDOUT)");
	assert.doesNotMatch(summarizeError(error), /secret/);
});

test("error summaries handle unknown thrown values", () => {
	assert.equal(summarizeError("sensitive text"), "UnknownError");
});

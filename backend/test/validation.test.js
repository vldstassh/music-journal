import test from "node:test";
import assert from "node:assert/strict";
import {
	normalizeEmail,
	validateEmail,
	validateMoodEntry,
	validatePassword,
} from "../lib/validation.js";

test("normalizes email addresses before persistence and lookup", () => {
	assert.equal(normalizeEmail("  Listener@Example.COM "), "listener@example.com");
	assert.deepEqual(validateEmail("listener@example.com"), { value: "listener@example.com" });
	assert.equal(validateEmail("not-an-email").error, "Enter a valid email address");
});

test("enforces stronger passwords for new accounts", () => {
	assert.match(validatePassword("short", { minimumLength: 8 }).error, /at least 8/);
	assert.deepEqual(validatePassword("long-enough", { minimumLength: 8, maximumBytes: 72 }), { value: "long-enough" });
	assert.match(validatePassword("x".repeat(73), { maximumBytes: 72 }).error, /72 UTF-8 bytes/);
	assert.match(validatePassword("x".repeat(1025)).error, /too long/);
});

test("normalizes a complete mood entry", () => {
	const result = validateMoodEntry({
		mood: "Calm",
		intensity: "7",
		songTitle: "  Weightless  ",
		artist: "  Marconi Union ",
		songLink: "https://example.com/listen",
		note: "  A quiet morning. ",
		clientId: "local-entry:123",
	});

	assert.deepEqual(result.value, {
		mood: "Calm",
		intensity: 7,
		songTitle: "Weightless",
		artist: "Marconi Union",
		songLink: "https://example.com/listen",
		note: "A quiet morning.",
		clientId: "local-entry:123",
	});
});

test("rejects invalid mood entry values", () => {
	assert.equal(validateMoodEntry(null).error, "Mood entry must be a JSON object");
	assert.match(validateMoodEntry({ mood: "Excited", songTitle: "Song" }).error, /Mood must be/);
	assert.equal(validateMoodEntry({ mood: "Joyful", songTitle: "" }).error, "Song title is required");
	assert.match(validateMoodEntry({ mood: "Joyful", songTitle: "Song", intensity: 11 }).error, /between 1 and 10/);
	assert.match(validateMoodEntry({ mood: "Joyful", songTitle: "Song", songLink: "javascript:alert(1)" }).error, /http or https/);
	assert.match(validateMoodEntry({ mood: "Joyful", songTitle: "Song", clientId: "invalid id" }).error, /Client ID/);
});

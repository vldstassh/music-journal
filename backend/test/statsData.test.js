import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEntries } from "../../public/statsData.js";

test("summarizes mood totals and valid intensities", () => {
	const summary = summarizeEntries([
		{ mood: "Calm", intensity: 8, createdAt: "2026-08-12T12:00:00.000Z" },
		{ mood: "Joyful", intensity: 4, createdAt: "2026-08-10T12:00:00.000Z" },
		{ mood: "Calm", intensity: 7, createdAt: "invalid" },
		{ mood: "Angry", intensity: 11, createdAt: "2026-08-13T12:00:00.000Z" },
	]);

	assert.equal(summary.totalEntries, 4);
	assert.equal(summary.topMood, "Calm");
	assert.equal(summary.moodCounts.Calm, 2);
	assert.equal(summary.moodCounts.Angry, 1);
	assert.equal(summary.averageIntensity, 19 / 3);
	assert.deepEqual(summary.intensitySeries, [
		{ createdAt: "2026-08-10T12:00:00.000Z", intensity: 4 },
		{ createdAt: "2026-08-12T12:00:00.000Z", intensity: 8 },
	]);
});

test("returns an empty, display-safe summary for missing entries", () => {
	const summary = summarizeEntries();

	assert.equal(summary.totalEntries, 0);
	assert.equal(summary.averageIntensity, null);
	assert.equal(summary.topMood, null);
	assert.deepEqual(summary.intensitySeries, []);
	assert.deepEqual(Object.values(summary.moodCounts), [0, 0, 0, 0, 0, 0]);
});

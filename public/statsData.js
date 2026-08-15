export const MOODS = Object.freeze([
	"Joyful",
	"Calm",
	"Focused",
	"Anxious",
	"Sad",
	"Angry",
]);

function normalizeIntensity(value) {
	const intensity = Number(value);
	return Number.isInteger(intensity) && intensity >= 1 && intensity <= 10
		? intensity
		: null;
}

export function summarizeEntries(input) {
	const entries = Array.isArray(input) ? input : [];
	const moodCounts = Object.fromEntries(MOODS.map((mood) => [mood, 0]));
	const intensitySeries = [];
	let intensityTotal = 0;
	let intensityCount = 0;

	for (const entry of entries) {
		if (!entry || typeof entry !== "object") {
			continue;
		}

		if (MOODS.includes(entry.mood)) {
			moodCounts[entry.mood] += 1;
		}

		const intensity = normalizeIntensity(entry.intensity);
		if (intensity === null) {
			continue;
		}

		intensityTotal += intensity;
		intensityCount += 1;
		const createdAt = new Date(entry.createdAt);
		if (!Number.isNaN(createdAt.getTime())) {
			intensitySeries.push({
				createdAt: createdAt.toISOString(),
				intensity,
			});
		}
	}

	intensitySeries.sort((first, second) => (
		new Date(first.createdAt) - new Date(second.createdAt)
	));

	const topMood = MOODS.reduce((top, mood) => (
		moodCounts[mood] > moodCounts[top] ? mood : top
	), MOODS[0]);

	return {
		averageIntensity: intensityCount ? intensityTotal / intensityCount : null,
		intensitySeries,
		moodCounts,
		topMood: moodCounts[topMood] ? topMood : null,
		totalEntries: entries.length,
	};
}

export const ALLOWED_MOODS = Object.freeze([
	"Joyful",
	"Calm",
	"Focused",
	"Anxious",
	"Sad",
	"Angry",
]);

const ALLOWED_MOOD_SET = new Set(ALLOWED_MOODS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;

function cleanText(value) {
	return typeof value === "string" ? value.trim() : "";
}

function validateTextLength(value, field, maximum) {
	if (value.length > maximum) {
		return `${field} must be ${maximum} characters or fewer`;
	}

	return null;
}

export function normalizeEmail(value) {
	return cleanText(value).toLowerCase();
}

export function validateEmail(value) {
	const email = normalizeEmail(value);

	if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
		return { error: "Enter a valid email address" };
	}

	return { value: email };
}

export function validatePassword(value, { minimumLength = 1, maximumBytes } = {}) {
	if (typeof value !== "string" || value.length < minimumLength) {
		return {
			error: minimumLength > 1
				? `Password must be at least ${minimumLength} characters`
				: "Password is required",
		};
	}

	if (value.length > 1024) {
		return { error: "Password is too long" };
	}

	if (maximumBytes && Buffer.byteLength(value, "utf8") > maximumBytes) {
		return { error: `Password must be ${maximumBytes} UTF-8 bytes or fewer` };
	}

	return { value };
}

export function validateMoodEntry(input = {}) {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return { error: "Mood entry must be a JSON object" };
	}

	const mood = cleanText(input.mood);
	const songTitle = cleanText(input.songTitle);
	const artist = cleanText(input.artist);
	const note = cleanText(input.note);
	const rawSongLink = cleanText(input.songLink) || cleanText(input.songUrl);
	const clientId = cleanText(input.clientId);
	const intensity = input.intensity === undefined || input.intensity === ""
		? 5
		: Number(input.intensity);

	if (!ALLOWED_MOOD_SET.has(mood)) {
		return { error: `Mood must be one of: ${ALLOWED_MOODS.join(", ")}` };
	}

	if (!songTitle) {
		return { error: "Song title is required" };
	}

	const lengthError = validateTextLength(songTitle, "Song title", 200)
		|| validateTextLength(artist, "Artist", 200)
		|| validateTextLength(note, "Note", 5000);

	if (lengthError) {
		return { error: lengthError };
	}

	if (!Number.isInteger(intensity) || intensity < 1 || intensity > 10) {
		return { error: "Intensity must be an integer between 1 and 10" };
	}

	let songLink = "";
	if (rawSongLink) {
		try {
			const parsedUrl = new URL(rawSongLink);
			if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
				return { error: "Song link must use http or https" };
			}
			songLink = parsedUrl.toString();
		} catch {
			return { error: "Song link must be a valid URL" };
		}
	}

	if (clientId && (clientId.length > 100 || !CLIENT_ID_PATTERN.test(clientId))) {
		return { error: "Client ID has an invalid format" };
	}

	return {
		value: {
			mood,
			intensity,
			songTitle,
			artist,
			songLink,
			note,
			clientId: clientId || null,
		},
	};
}

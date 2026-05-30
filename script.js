const STORAGE_KEY = "musicJournalEntries";
const API_BASE = globalThis.MUSIC_JOURNAL_API_BASE || getStoredValue("musicJournalApiBase") || "";
const MOODS = ["Joyful", "Calm", "Focused", "Anxious", "Sad", "Angry"];

const form = document.querySelector("#journalForm");
const timeline = document.querySelector("#timeline");
const template = document.querySelector("#entryTemplate");
const emptyState = document.querySelector("#emptyState");
const moodFilter = document.querySelector("#moodFilter");
const intensity = document.querySelector("#intensity");
const intensityValue = document.querySelector("#intensityValue");
const formMessage = document.querySelector("#formMessage");
const syncStatus = document.querySelector("#syncStatus");
const entryCount = document.querySelector("#entryCount");
const topMood = document.querySelector("#topMood");
const averageIntensity = document.querySelector("#averageIntensity");
const clearForm = document.querySelector("#clearForm");
const exportEntries = document.querySelector("#exportEntries");

let entries = loadEntries();

function getStoredValue(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function setStoredValue(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// The journal still works for the current session if storage is unavailable.
	}
}

function createId() {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadEntries() {
	try {
		return JSON.parse(getStoredValue(STORAGE_KEY)) || [];
	} catch {
		return [];
	}
}

function saveEntries() {
	setStoredValue(STORAGE_KEY, JSON.stringify(entries));
}

function normalizeEntry(entry) {
	const createdAt = entry.createdAt || entry.date || new Date().toISOString();
	return {
		id: entry._id || entry.id || entry.clientId || createId(),
		clientId: entry.clientId || "",
		mood: entry.mood || "Joyful",
		intensity: Number(entry.intensity || 5),
		songTitle: entry.songTitle || entry.song || "Untitled song",
		artist: entry.artist || "",
		songUrl: entry.songUrl || entry.songLink || entry.url || "",
		note: entry.note || "",
		createdAt,
	};
}

function formatDate(value) {
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

function setMessage(message) {
	formMessage.textContent = message;
	if (!message) {
		return;
	}
	window.clearTimeout(setMessage.timer);
	setMessage.timer = window.setTimeout(() => {
		formMessage.textContent = "";
	}, 2800);
}

function updateMoodFilter() {
	const currentValue = moodFilter.value;
	moodFilter.innerHTML = '<option value="all">All moods</option>';
	MOODS.forEach((mood) => {
		const option = document.createElement("option");
		option.value = mood;
		option.textContent = mood;
		moodFilter.append(option);
	});
	moodFilter.value = MOODS.includes(currentValue) ? currentValue : "all";
}

function renderStats(list) {
	entryCount.textContent = entries.length.toString();

	if (!entries.length) {
		topMood.textContent = "-";
		averageIntensity.textContent = "-";
		return;
	}

	const moodTotals = entries.reduce((totals, entry) => {
		totals[entry.mood] = (totals[entry.mood] || 0) + 1;
		return totals;
	}, {});
	const highestMood = Object.entries(moodTotals).sort((a, b) => b[1] - a[1])[0][0];
	const average = entries.reduce((sum, entry) => sum + Number(entry.intensity || 0), 0) / entries.length;

	topMood.textContent = highestMood;
	averageIntensity.textContent = average.toFixed(1);
	emptyState.classList.toggle("is-hidden", list.length > 0);
}

function renderEntries() {
	const selectedMood = moodFilter.value;
	const filteredEntries = entries
		.filter((entry) => selectedMood === "all" || entry.mood === selectedMood)
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

	timeline.innerHTML = "";
	filteredEntries.forEach((entry) => {
		const item = template.content.cloneNode(true);
		item.querySelector(".entry-date").textContent = formatDate(entry.createdAt);
		item.querySelector(".entry-mood").textContent = entry.mood;
		item.querySelector(".entry-intensity").textContent = `Intensity ${entry.intensity}/10`;
		item.querySelector("h3").textContent = entry.songTitle;
		item.querySelector(".entry-artist").textContent = entry.artist || "Unknown artist";
		item.querySelector(".entry-note").textContent = entry.note || "No note added.";

		const link = item.querySelector(".entry-link");
		if (entry.songUrl) {
			link.href = entry.songUrl;
		} else {
			link.remove();
		}

		timeline.append(item);
	});

	emptyState.classList.toggle("is-hidden", filteredEntries.length > 0);
	renderStats(filteredEntries);
}

function resetForm() {
	form.reset();
	intensity.value = "6";
	intensityValue.textContent = "6";
	form.elements.mood.value = "Joyful";
}

async function syncFromApi() {
	try {
		const response = await fetch(`${API_BASE}/api/moods`, {
			credentials: "include",
		});
		if (!response.ok) {
			throw new Error("Mood API unavailable");
		}

		const remoteEntries = (await response.json()).map(normalizeEntry);
		const merged = new Map(entries.map((entry) => [entry.id, entry]));
		remoteEntries.forEach((entry) => {
			if (entry.clientId) {
				merged.delete(entry.clientId);
			}
			merged.set(entry.id, entry);
		});
		entries = [...merged.values()];
		saveEntries();
		syncStatus.textContent = "Synced";
		syncStatus.classList.add("is-online");
		renderEntries();
	} catch {
		syncStatus.textContent = "Offline-ready";
		syncStatus.classList.remove("is-online");
	}
}

async function saveToApi(entry) {
	try {
		const response = await fetch(`${API_BASE}/api/moods`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				clientId: entry.id,
				mood: entry.mood,
				intensity: entry.intensity,
				songTitle: entry.songTitle,
				artist: entry.artist,
				songLink: entry.songUrl,
				note: entry.note,
			}),
			credentials: "include",
		});

		if (!response.ok) {
			throw new Error("Could not save remotely");
		}

		const result = await response.json();
		syncStatus.textContent = "Synced";
		syncStatus.classList.add("is-online");
		return normalizeEntry(result.data || result);
	} catch {
		syncStatus.textContent = "Saved locally";
		syncStatus.classList.remove("is-online");
		return null;
	}
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();

	const formData = new FormData(form);
	const entry = normalizeEntry({
		id: createId(),
		mood: formData.get("mood"),
		intensity: formData.get("intensity"),
		songTitle: formData.get("songTitle").trim(),
		artist: formData.get("artist").trim(),
		songUrl: formData.get("songUrl").trim(),
		note: formData.get("note").trim(),
		createdAt: new Date().toISOString(),
	});

	entries = [entry, ...entries];
	saveEntries();
	renderEntries();
	resetForm();
	setMessage("Entry saved");
	const remoteEntry = await saveToApi(entry);
	if (remoteEntry) {
		entries = entries.map((currentEntry) => (
			currentEntry.id === entry.id ? remoteEntry : currentEntry
		));
		saveEntries();
		renderEntries();
	}
});

intensity.addEventListener("input", () => {
	intensityValue.textContent = intensity.value;
});

moodFilter.addEventListener("change", renderEntries);
clearForm.addEventListener("click", resetForm);

exportEntries.addEventListener("click", () => {
	const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "music-journal-entries.json";
	link.click();
	URL.revokeObjectURL(url);
});

updateMoodFilter();
renderEntries();
syncFromApi();

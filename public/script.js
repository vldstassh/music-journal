const LEGACY_STORAGE_KEY = "musicJournalEntries";
const ANONYMOUS_STORAGE_KEY = "musicJournalEntries:anonymous";
const USER_STORAGE_PREFIX = "musicJournalEntries:user:";
const API_BASE =
	globalThis.MUSIC_JOURNAL_API_BASE ||
	getStoredValue("musicJournalApiBase") ||
	"";
const MOODS = ["Joyful", "Calm", "Focused", "Anxious", "Sad", "Angry"];

const form = document.querySelector("#journalForm");
const timeline = document.querySelector("#timeline");
const template = document.querySelector("#entryTemplate");
const emptyState = document.querySelector("#emptyState");
const emptyStateTitle = document.querySelector("#emptyStateTitle");
const emptyStateMessage = document.querySelector("#emptyStateMessage");
const moodFilter = document.querySelector("#moodFilter");
const intensity = document.querySelector("#intensity");
const intensityValue = document.querySelector("#intensityValue");
const formMessage = document.querySelector("#formMessage");
const syncStatus = document.querySelector("#syncStatus");
const entryCount = document.querySelector("#entryCount");
const topMood = document.querySelector("#topMood");
const averageIntensity = document.querySelector("#averageIntensity");
const clearForm = document.querySelector("#clearForm");
const clearLocalDataButton = document.querySelector("#clearLocalDataButton");
const exportEntries = document.querySelector("#exportEntries");
const signInLink = document.querySelector("#signInLink");
const accountActions = document.querySelector("#accountActions");
const accountEmail = document.querySelector("#accountEmail");
const logoutButton = document.querySelector("#logoutButton");
const entryTitle = document.querySelector("#entryTitle");
const saveEntryButton = document.querySelector("#saveEntryButton");
const cancelEditButton = document.querySelector("#cancelEditButton");

let currentUser = null;
let storageKey = ANONYMOUS_STORAGE_KEY;
let entries = [];
let syncPromise = null;
let editingEntryId = null;
let entryActionPending = false;
let sessionInitializing = true;

class ApiError extends Error {
	constructor(message, status) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

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
		return true;
	} catch {
		return false;
	}
}

function removeStoredValue(key) {
	try {
		localStorage.removeItem(key);
	} catch {
		// Storage may be unavailable in privacy-restricted browsing contexts.
	}
}

function removeMusicJournalLocalData() {
	const keysToRemove = new Set([
		LEGACY_STORAGE_KEY,
		ANONYMOUS_STORAGE_KEY,
		"musicJournalApiBase",
	]);

	try {
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key?.startsWith(USER_STORAGE_PREFIX)) {
				keysToRemove.add(key);
			}
		}
	} catch {
		// Known keys are still removed individually when storage enumeration is unavailable.
	}

	keysToRemove.forEach(removeStoredValue);
}

function migrateLegacyEntries() {
	if (getStoredValue(ANONYMOUS_STORAGE_KEY) !== null) {
		return;
	}

	const legacyEntries = getStoredValue(LEGACY_STORAGE_KEY);
	if (
		legacyEntries !== null &&
		setStoredValue(ANONYMOUS_STORAGE_KEY, legacyEntries)
	) {
		removeStoredValue(LEGACY_STORAGE_KEY);
	}
}

function createId() {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}

	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeHttpUrl(value) {
	if (typeof value !== "string" || !value.trim()) {
		return "";
	}

	try {
		const url = new URL(value.trim());
		return url.protocol === "http:" || url.protocol === "https:"
			? url.toString()
			: "";
	} catch {
		return "";
	}
}

function normalizeEntry(entry, { pending = Boolean(entry?.pending) } = {}) {
	if (!entry || typeof entry !== "object") {
		return null;
	}

	const mood = MOODS.includes(entry.mood) ? entry.mood : null;
	const intensityNumber = Number(entry.intensity);
	const songTitle =
		typeof (entry.songTitle || entry.song) === "string"
			? (entry.songTitle || entry.song).trim()
			: "";

	if (
		!mood ||
		!Number.isInteger(intensityNumber) ||
		intensityNumber < 1 ||
		intensityNumber > 10 ||
		!songTitle
	) {
		return null;
	}

	const rawId = entry._id || entry.id || entry.clientId;
	const id = typeof rawId === "string" && rawId ? rawId : createId();
	const parsedDate = new Date(entry.createdAt || entry.date);

	return {
		id,
		clientId: typeof entry.clientId === "string" ? entry.clientId : "",
		mood,
		intensity: intensityNumber,
		songTitle: songTitle.slice(0, 200),
		artist:
			typeof entry.artist === "string"
				? entry.artist.trim().slice(0, 200)
				: "",
		songUrl: normalizeHttpUrl(entry.songUrl || entry.songLink || entry.url),
		note:
			typeof entry.note === "string"
				? entry.note.trim().slice(0, 5000)
				: "",
		createdAt: Number.isNaN(parsedDate.getTime())
			? new Date().toISOString()
			: parsedDate.toISOString(),
		pending,
	};
}

function loadEntries(key = storageKey) {
	try {
		const storedEntries = JSON.parse(getStoredValue(key) || "[]");
		return Array.isArray(storedEntries)
			? storedEntries
					.map((entry) => normalizeEntry(entry))
					.filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

function saveEntries() {
	setStoredValue(storageKey, JSON.stringify(entries));
}

function switchStorage(nextStorageKey) {
	storageKey = nextStorageKey;
	entries = loadEntries();
	resetForm();
	renderEntries();
}

function formatDate(value) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown date";
	}

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function setMessage(message, { isError = false } = {}) {
	window.clearTimeout(setMessage.timer);
	formMessage.textContent = message;
	formMessage.classList.toggle("is-error", isError);

	if (message) {
		setMessage.timer = window.setTimeout(() => {
			formMessage.textContent = "";
			formMessage.classList.remove("is-error");
		}, 4000);
	}
}

function setSyncStatus(message, state = "local") {
	syncStatus.textContent = message;
	syncStatus.classList.toggle("is-online", state === "online");
	syncStatus.classList.toggle("has-pending", state === "pending");
}

function updateMoodFilter() {
	const currentValue = moodFilter.value;
	moodFilter.replaceChildren();

	const allMoodsOption = document.createElement("option");
	allMoodsOption.value = "all";
	allMoodsOption.textContent = "All moods";
	moodFilter.append(allMoodsOption);

	MOODS.forEach((mood) => {
		const option = document.createElement("option");
		option.value = mood;
		option.textContent = mood;
		moodFilter.append(option);
	});

	moodFilter.value = MOODS.includes(currentValue) ? currentValue : "all";
}

function renderStats() {
	entryCount.textContent = entries.length.toString();
	exportEntries.disabled = entries.length === 0;

	if (!entries.length) {
		topMood.textContent = "–";
		averageIntensity.textContent = "–";
		return;
	}

	const moodTotals = entries.reduce((totals, entry) => {
		totals.set(entry.mood, (totals.get(entry.mood) || 0) + 1);
		return totals;
	}, new Map());
	const highestMood = MOODS.reduce(
		(top, mood) =>
			(moodTotals.get(mood) || 0) > (moodTotals.get(top) || 0)
				? mood
				: top,
		MOODS[0],
	);
	const average =
		entries.reduce((sum, entry) => sum + entry.intensity, 0) /
		entries.length;

	topMood.textContent = highestMood;
	averageIntensity.textContent = average.toFixed(1);
}

function renderEntries() {
	const selectedMood = moodFilter.value || "all";
	const filteredEntries = entries
		.filter(
			(entry) => selectedMood === "all" || entry.mood === selectedMood,
		)
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

	timeline.replaceChildren();
	filteredEntries.forEach((entry) => {
		const item = template.content.cloneNode(true);
		item.querySelector(".entry-card").dataset.entryId = entry.id;
		const editButton = item.querySelector(".editbutton");
		const deleteButton = item.querySelector(".deletebutton");
		editButton.setAttribute("aria-label", `Edit ${entry.songTitle}`);
		deleteButton.setAttribute("aria-label", `Delete ${entry.songTitle}`);
		editButton.addEventListener("click", () => startEditing(entry.id));
		deleteButton.addEventListener("click", () => deleteEntry(entry.id));
		item.querySelector(".entry-date").textContent = formatDate(
			entry.createdAt,
		);
		item.querySelector(".entry-mood").textContent = entry.mood;
		item.querySelector(".entry-intensity").textContent =
			`Intensity ${entry.intensity}/10`;
		item.querySelector("h3").textContent = entry.songTitle;
		item.querySelector(".entry-artist").textContent =
			entry.artist || "Unknown artist";
		item.querySelector(".entry-note").textContent =
			entry.note || "No note added.";
		item.querySelector(".entry-sync").classList.toggle(
			"is-hidden",
			!entry.pending,
		);

		const link = item.querySelector(".entry-link");
		if (entry.songUrl) {
			link.href = entry.songUrl;
		} else {
			link.remove();
		}

		timeline.append(item);
	});

	const hasVisibleEntries = filteredEntries.length > 0;
	emptyState.classList.toggle("is-hidden", hasVisibleEntries);
	if (!hasVisibleEntries && entries.length) {
		emptyStateTitle.textContent = "No matching entries";
		emptyStateMessage.textContent = `There are no ${selectedMood.toLowerCase()} entries yet.`;
	} else {
		emptyStateTitle.textContent = "No entries yet";
		emptyStateMessage.textContent =
			"Your first mood and song will appear here.";
	}

	renderStats();
	updateEntryControls();
}

function isJournalBusy() {
	return sessionInitializing || Boolean(syncPromise) || entryActionPending;
}

function updateEntryControls() {
	const busy = isJournalBusy();
	form.setAttribute("aria-busy", String(busy));
	form.classList.toggle("is-editing", editingEntryId !== null);
	const isEditing = editingEntryId !== null;
	entryTitle.textContent = isEditing ? "Edit entry" : "Log a mood and song";
	saveEntryButton.textContent = entryActionPending
		? "Working…"
		: isEditing ? "Save changes" : "Save entry";
	cancelEditButton.classList.toggle("is-hidden", !isEditing);
	form.querySelectorAll("input, textarea, button").forEach((control) => {
		control.disabled = busy;
	});
	clearForm.disabled = busy;
	logoutButton.disabled = busy;
	clearLocalDataButton.disabled = busy;
	timeline.querySelectorAll(".entry-card").forEach((card) => {
		card.classList.toggle("is-editing", card.dataset.entryId === editingEntryId);
		card.querySelectorAll("button").forEach((button) => {
			button.disabled = busy;
		});
	});
}

function refreshSyncStatus() {
	if (!currentUser) {
		setSyncStatus("Local journal");
		return;
	}
	const pendingCount = entries.filter((entry) => entry.pending).length;
	setSyncStatus(
		pendingCount ? `${pendingCount} waiting to sync` : "Synced",
		pendingCount ? "pending" : "online",
	);
}

function resetForm() {
	editingEntryId = null;
	form.reset();
	intensity.value = "6";
	intensityValue.textContent = "6";
	form.elements.mood.value = "Joyful";
	updateEntryControls();
}

function startEditing(id) {
	if (isJournalBusy()) {
		return;
	}
	const entry = entries.find((candidate) => candidate.id === id);
	if (!entry) {
		return;
	}

	editingEntryId = id;
	for (const field of ["mood", "intensity", "songTitle", "artist", "songUrl", "note"]) {
		form.elements[field].value = entry[field];
	}
	intensityValue.textContent = String(entry.intensity);
	updateEntryControls();
	setMessage("Edit the entry below, then save your changes.");
	if (currentUser) {
		setSyncStatus("Editing · sync paused", "pending");
	}
	form.scrollIntoView({ block: "nearest" });
	form.elements.songTitle.focus();
}

function cancelEditing() {
	if (isJournalBusy()) {
		return;
	}
	resetForm();
	setMessage("Edit cancelled");
	refreshSyncStatus();
	form.elements.songTitle.focus();
	syncEntries();
}

function handleEntryActionError(error) {
	if (error instanceof ApiError && error.status === 401) {
		useAnonymousJournal("Session expired");
		setMessage("Your session expired. Sign in to resume syncing.", { isError: true });
		return;
	}
	setSyncStatus(error instanceof ApiError ? "Changes not saved" : "Offline", "pending");
	setMessage(error.message || "Could not update this entry. Try again.", { isError: true });
}

async function deleteEntry(id) {
	if (isJournalBusy()) {
		return;
	}
	const entry = entries.find((candidate) => candidate.id === id);
	if (!entry) {
		return;
	}
	const isSynced = Boolean(currentUser) && !entry.pending;
	if (isSynced && !window.confirm(`Permanently delete “${entry.songTitle}” from your journal? This cannot be undone.`)) {
		return;
	}

	entryActionPending = true;
	updateEntryControls();
	try {
		if (isSynced) {
			setSyncStatus("Deleting entry…", "pending");
			const result = await apiRequest("/api/moods/delete_that_song", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ moodIds: [id] }),
			});
			if (result?.deletedCount !== 1) {
				throw new ApiError("Entry was not deleted. Refresh and try again.", 404);
			}
		}
		entries = entries.filter((candidate) => candidate.id !== id);
		saveEntries();
		if (editingEntryId === id) {
			resetForm();
		}
		renderEntries();
		refreshSyncStatus();
		setMessage(isSynced ? "Entry deleted" : "Entry deleted from this browser");
	} catch (error) {
		handleEntryActionError(error);
	} finally {
		entryActionPending = false;
		updateEntryControls();
		saveEntryButton.focus();
	}
}

async function apiRequest(path, options = {}) {
	const response = await fetch(`${API_BASE}${path}`, {
		credentials: "include",
		...options,
	});
	const contentType = response.headers.get("content-type") || "";
	const payload = contentType.includes("application/json")
		? await response.json()
		: null;

	if (!response.ok) {
		throw new ApiError(
			payload?.error || `Request failed with status ${response.status}`,
			response.status,
		);
	}

	return payload;
}

function entryRequestBody(entry) {
	return JSON.stringify({
		clientId: entry.clientId || entry.id,
		mood: entry.mood,
		intensity: entry.intensity,
		songTitle: entry.songTitle,
		artist: entry.artist,
		songLink: entry.songUrl,
		note: entry.note,
	});
}

function updateAccountUi() {
	const isSignedIn = Boolean(currentUser);
	signInLink.classList.toggle("is-hidden", isSignedIn);
	accountActions.classList.toggle("is-hidden", !isSignedIn);
	accountEmail.textContent = currentUser?.email || "";
}

function useAnonymousJournal(statusMessage = "Local journal") {
	currentUser = null;
	updateAccountUi();
	switchStorage(ANONYMOUS_STORAGE_KEY);
	setSyncStatus(statusMessage);
}

async function syncEntries() {
	if (!currentUser) {
		setSyncStatus("Local journal");
		return;
	}

	if (syncPromise) {
		return syncPromise;
	}
	// Keep refreshes and POST retries from overwriting an edit or resurrecting a deletion.
	if (entryActionPending || editingEntryId !== null) {
		return;
	}

	syncPromise = (async () => {
		try {
			setSyncStatus("Syncing…", "pending");
			const pendingEntries = entries.filter((entry) => entry.pending);

			for (const pendingEntry of pendingEntries) {
				const result = await apiRequest("/api/moods", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: entryRequestBody(pendingEntry),
				});
				let remoteEntry = normalizeEntry(result.data, {
					pending: false,
				});
				// A retried POST can return an older record if its first response was lost.
				// Apply any local edit to that same record before clearing the pending flag.
				if (remoteEntry && entryRequestBody(remoteEntry) !== entryRequestBody(pendingEntry)) {
					const updated = await apiRequest(`/api/moods/${encodeURIComponent(remoteEntry.id)}`, {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: entryRequestBody(pendingEntry),
					});
					const updatedEntry = normalizeEntry(updated?.data, { pending: false });
					if (!updatedEntry || updatedEntry.id !== remoteEntry.id) {
						throw new ApiError("Invalid entry response", 500);
					}
					remoteEntry = updatedEntry;
				}
				if (remoteEntry) {
					entries = entries.map((entry) =>
						entry.id === pendingEntry.id ? remoteEntry : entry,
					);
					saveEntries();
					renderEntries();
				}
			}

			const result = await apiRequest("/api/moods");
			const remoteEntries = (
				Array.isArray(result) ? result : result?.data || []
			)
				.map((entry) => normalizeEntry(entry, { pending: false }))
				.filter(Boolean);
			const unsyncedEntries = entries.filter((entry) => entry.pending);
			entries = [...unsyncedEntries, ...remoteEntries];
			saveEntries();
			renderEntries();
			setSyncStatus("Synced", "online");
		} catch (error) {
			if (error instanceof ApiError && error.status === 401) {
				useAnonymousJournal("Session expired");
				setMessage("Your session expired. Sign in to resume syncing.", {
					isError: true,
				});
				return;
			}

			const pendingCount = entries.filter(
				(entry) => entry.pending,
			).length;
			setSyncStatus(
				pendingCount ? `${pendingCount} waiting to sync` : "Offline",
				pendingCount ? "pending" : "local",
			);
		}
	})().finally(() => {
		syncPromise = null;
		updateEntryControls();
	});

	updateEntryControls();
	return syncPromise;
}

async function initializeSession() {
	try {
		const result = await apiRequest("/api/user");
		const user = result?.user || result;
		if (!user?.id || !user?.email) {
			throw new ApiError("Invalid account response", 500);
		}

		currentUser = { id: String(user.id), email: String(user.email) };
		updateAccountUi();
		switchStorage(`${USER_STORAGE_PREFIX}${currentUser.id}`);
		await syncEntries();
	} catch (error) {
		useAnonymousJournal(
			error instanceof ApiError && error.status === 401
				? "Local journal"
				: "Offline journal",
		);
	}
}

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (isJournalBusy()) {
		return;
	}
	setMessage("");

	if (!form.reportValidity()) {
		return;
	}

	const formData = new FormData(form);
	const songUrl = String(formData.get("songUrl") || "").trim();
	if (songUrl && !normalizeHttpUrl(songUrl)) {
		setMessage("Song link must be a valid http or https URL.", {
			isError: true,
		});
		return;
	}

	const originalEntry = entries.find((entry) => entry.id === editingEntryId);
	if (editingEntryId !== null && !originalEntry) {
		setMessage("This entry is no longer available. Cancel the edit and refresh.", { isError: true });
		return;
	}
	const id = originalEntry?.id || createId();
	const entry = normalizeEntry(
		{
			id,
			clientId: originalEntry ? originalEntry.clientId : id,
			mood: formData.get("mood"),
			intensity: formData.get("intensity"),
			songTitle: formData.get("songTitle"),
			artist: formData.get("artist"),
			songUrl,
			note: formData.get("note"),
			createdAt: originalEntry?.createdAt || new Date().toISOString(),
		},
		{ pending: originalEntry ? originalEntry.pending : Boolean(currentUser) },
	);

	if (!entry) {
		setMessage("Check the entry fields and try again.", { isError: true });
		return;
	}

	if (originalEntry) {
		entryActionPending = true;
		updateEntryControls();
		try {
			let updatedEntry = entry;
			if (currentUser && !originalEntry.pending) {
				setSyncStatus("Saving changes…", "pending");
				const result = await apiRequest(`/api/moods/${encodeURIComponent(id)}`, {
					method: "PUT",
					headers: { "Content-Type": "application/json" },
					body: entryRequestBody(entry),
				});
				updatedEntry = normalizeEntry(result?.data, { pending: false });
				if (!updatedEntry || updatedEntry.id !== id) {
					throw new ApiError("Invalid entry response. Refresh and try again.", 500);
				}
			}
			entries = entries.map((candidate) => candidate.id === id ? updatedEntry : candidate);
			saveEntries();
			renderEntries();
			resetForm();
			refreshSyncStatus();
			setMessage(currentUser && !entry.pending ? "Entry updated" : "Changes saved to this browser");
		} catch (error) {
			handleEntryActionError(error);
		} finally {
			entryActionPending = false;
			updateEntryControls();
		}
		return;
	}

	entries = [entry, ...entries];
	saveEntries();
	renderEntries();
	resetForm();
	setMessage(
		currentUser ? "Entry saved; syncing…" : "Entry saved to this browser",
	);
	await syncEntries();
});

intensity.addEventListener("input", () => {
	intensityValue.textContent = intensity.value;
});

moodFilter.addEventListener("change", renderEntries);
clearForm.addEventListener("click", () => {
	if (editingEntryId !== null) {
		cancelEditing();
	} else if (!isJournalBusy()) {
		resetForm();
	}
});
cancelEditButton.addEventListener("click", cancelEditing);

exportEntries.addEventListener("click", () => {
	if (!entries.length) {
		return;
	}

	const exportedEntries = entries.map(({ pending, ...entry }) => entry);
	const blob = new Blob([JSON.stringify(exportedEntries, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `music-journal-${new Date().toISOString().slice(0, 10)}.json`;
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
});

logoutButton.addEventListener("click", async () => {
	if (isJournalBusy()) {
		return;
	}
	entryActionPending = true;
	updateEntryControls();
	try {
		await apiRequest("/api/logout", { method: "POST" });
		useAnonymousJournal("Signed out · local journal");
	} catch (error) {
		setMessage(error.message || "Could not sign out", { isError: true });
	} finally {
		entryActionPending = false;
		updateEntryControls();
	}
});

clearLocalDataButton.addEventListener("click", async () => {
	if (isJournalBusy()) {
		return;
	}
	const warning = currentUser
		? "Clear Music Journal data cached on this device and sign out? Your account and synced journal entries in MongoDB will not be deleted. Any entries still waiting to sync will be lost."
		: "Clear Music Journal data stored in this browser? This does not delete any account or synced journal entries in MongoDB.";

	if (!window.confirm(warning)) {
		return;
	}

	entryActionPending = true;
	updateEntryControls();
	try {
		if (currentUser) {
			await apiRequest("/api/logout", { method: "POST" });
		}

		removeMusicJournalLocalData();
		if (currentUser) {
			window.location.replace("login.html");
			return;
		}

		storageKey = ANONYMOUS_STORAGE_KEY;
		entries = [];
		moodFilter.value = "all";
		resetForm();
		renderEntries();
		setSyncStatus("Local data cleared");
		setMessage(
			"Local browser data cleared. Synced account data was not deleted.",
		);
	} catch (error) {
		setMessage(
			error.message || "Could not sign out before clearing local data",
			{ isError: true },
		);
	} finally {
		entryActionPending = false;
		updateEntryControls();
	}
});

window.addEventListener("online", () => syncEntries());
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		syncEntries();
	}
});

migrateLegacyEntries();
entries = loadEntries();
updateMoodFilter();
renderEntries();
updateAccountUi();
initializeSession().finally(() => {
	sessionInitializing = false;
	updateEntryControls();
});

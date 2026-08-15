import { MOODS, summarizeEntries } from "./statsData.js";

const LEGACY_STORAGE_KEY = "musicJournalEntries";
const ANONYMOUS_STORAGE_KEY = "musicJournalEntries:anonymous";
const USER_STORAGE_PREFIX = "musicJournalEntries:user:";
const API_BASE = globalThis.MUSIC_JOURNAL_API_BASE
	|| getStoredValue("musicJournalApiBase")
	|| "";

const averageIntensity = document.querySelector("#averageIntensity");
const totalEntries = document.querySelector("#totalEntries");
const topMood = document.querySelector("#topMood");
const moodChart = document.querySelector("#moodChart");
const intensityChart = document.querySelector("#intensityChart");
const moodChartEmpty = document.querySelector("#moodChartEmpty");
const intensityChartEmpty = document.querySelector("#intensityChartEmpty");
const statsMessage = document.querySelector("#statsMessage");
const syncStatus = document.querySelector("#syncStatus");
const signInLink = document.querySelector("#signInLink");
const accountActions = document.querySelector("#accountActions");
const accountEmail = document.querySelector("#accountEmail");
const logoutButton = document.querySelector("#logoutButton");
const clearLocalDataButton = document.querySelector("#clearLocalDataButton");

const MOOD_COLORS = Object.freeze({
	Joyful: "#c28b2c",
	Calm: "#2c6e63",
	Focused: "#5578a6",
	Anxious: "#b17635",
	Sad: "#6f7f99",
	Angry: "#b9575b",
});

let currentUser = null;
let currentSummary = summarizeEntries([]);
let resizeFrame;

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
		// Known keys are still removed individually if enumeration is unavailable.
	}

	keysToRemove.forEach(removeStoredValue);
}

async function apiRequest(path, options = {}) {
	let response;
	try {
		response = await fetch(`${API_BASE}${path}`, {
			credentials: "include",
			...options,
		});
	} catch {
		throw new ApiError("Unable to reach the Music Journal server", 0);
	}

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

async function getAllMoods() {
	const payload = await apiRequest("/api/moods");
	return Array.isArray(payload?.data) ? payload.data : [];
}

function setStatus(message, { isError = false, state = "local" } = {}) {
	statsMessage.textContent = message;
	statsMessage.classList.toggle("is-error", isError);
	syncStatus.textContent = isError ? "Stats unavailable" : message;
	syncStatus.classList.toggle("is-online", state === "online");
	syncStatus.classList.toggle("has-pending", state === "pending");
}

function updateAccountUi() {
	const isSignedIn = Boolean(currentUser);
	signInLink.classList.toggle("is-hidden", isSignedIn);
	accountActions.classList.toggle("is-hidden", !isSignedIn);
	accountEmail.textContent = currentUser?.email || "";
}

function prepareCanvas(canvas) {
	const context = canvas.getContext("2d");
	const width = Math.max(280, Math.floor(canvas.getBoundingClientRect().width));
	const height = 300;
	const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);

	canvas.width = Math.round(width * pixelRatio);
	canvas.height = Math.round(height * pixelRatio);
	context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
	context.clearRect(0, 0, width, height);
	context.font = "12px Inter, system-ui, sans-serif";
	context.textBaseline = "middle";
	return { context, height, width };
}

function drawMoodChart(summary) {
	const { context, height, width } = prepareCanvas(moodChart);
	const counts = MOODS.map((mood) => summary.moodCounts[mood]);
	const maximum = Math.max(...counts, 1);
	const left = 68;
	const right = 34;
	const top = 16;
	const bottom = 16;
	const rowHeight = (height - top - bottom) / MOODS.length;
	const availableWidth = width - left - right;

	context.fillStyle = "#706b63";
	context.textAlign = "right";
	MOODS.forEach((mood, index) => {
		const count = summary.moodCounts[mood];
		const y = top + (index * rowHeight) + (rowHeight / 2);
		const barHeight = Math.min(24, rowHeight * 0.56);
		const barWidth = count ? Math.max(3, (count / maximum) * availableWidth) : 0;

		context.fillText(mood, left - 10, y);
		context.fillStyle = MOOD_COLORS[mood];
		context.fillRect(left, y - (barHeight / 2), barWidth, barHeight);
		context.fillStyle = "#191919";
		context.textAlign = "left";
		context.fillText(String(count), left + barWidth + 7, y);
		context.fillStyle = "#706b63";
		context.textAlign = "right";
	});

	const populatedMoods = MOODS
		.filter((mood) => summary.moodCounts[mood])
		.map((mood) => `${mood}: ${summary.moodCounts[mood]}`);
	moodChart.setAttribute(
		"aria-label",
		populatedMoods.length
			? `Mood totals. ${populatedMoods.join(", ")}.`
			: "Mood totals. No journal entries yet.",
	);
	moodChartEmpty.classList.toggle("is-hidden", summary.totalEntries > 0);
}

function formatShortDate(value) {
	return new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "short",
	}).format(new Date(value));
}

function drawIntensityChart(summary) {
	const { context, height, width } = prepareCanvas(intensityChart);
	const series = summary.intensitySeries;
	const left = 38;
	const right = 18;
	const top = 20;
	const bottom = 36;
	const chartWidth = width - left - right;
	const chartHeight = height - top - bottom;

	context.strokeStyle = "#ddd5c7";
	context.fillStyle = "#706b63";
	context.lineWidth = 1;
	context.textAlign = "right";
	for (const intensity of [1, 5, 10]) {
		const y = top + ((10 - intensity) / 9) * chartHeight;
		context.beginPath();
		context.moveTo(left, y);
		context.lineTo(width - right, y);
		context.stroke();
		context.fillText(String(intensity), left - 8, y);
	}

	if (series.length) {
		const pointFor = (entry, index) => ({
			x: series.length === 1
				? left + (chartWidth / 2)
				: left + (index / (series.length - 1)) * chartWidth,
			y: top + ((10 - entry.intensity) / 9) * chartHeight,
		});

		context.strokeStyle = "#2c6e63";
		context.fillStyle = "#2c6e63";
		context.lineWidth = 3;
		context.lineJoin = "round";
		context.lineCap = "round";
		context.beginPath();
		series.forEach((entry, index) => {
			const point = pointFor(entry, index);
			if (index === 0) {
				context.moveTo(point.x, point.y);
			} else {
				context.lineTo(point.x, point.y);
			}
		});
		context.stroke();

		series.forEach((entry, index) => {
			const point = pointFor(entry, index);
			context.beginPath();
			context.arc(point.x, point.y, 4, 0, Math.PI * 2);
			context.fill();
		});

		context.fillStyle = "#706b63";
		context.textAlign = "left";
		context.fillText(formatShortDate(series[0].createdAt), left, height - 13);
		if (series.length > 1) {
			context.textAlign = "right";
			context.fillText(
				formatShortDate(series.at(-1).createdAt),
				width - right,
				height - 13,
			);
		}
	}

	intensityChart.setAttribute(
		"aria-label",
		series.length
			? `Intensity over time for ${series.length} journal entries.`
			: "Intensity over time. No dated journal entries yet.",
	);
	intensityChartEmpty.classList.toggle("is-hidden", series.length > 0);
}

function renderSummary(summary) {
	totalEntries.textContent = String(summary.totalEntries);
	averageIntensity.textContent = summary.averageIntensity === null
		? "—"
		: summary.averageIntensity.toFixed(1);
	topMood.textContent = summary.topMood || "—";
	drawMoodChart(summary);
	drawIntensityChart(summary);
}

async function initializeStats() {
	setStatus("Loading statistics…", { state: "pending" });

	try {
		const userPayload = await apiRequest("/api/user");
		const user = userPayload?.user;
		if (!user?.id || !user?.email) {
			throw new ApiError("Invalid account response", 500);
		}

		currentUser = { id: String(user.id), email: String(user.email) };
		updateAccountUi();
		currentSummary = summarizeEntries(await getAllMoods());
		renderSummary(currentSummary);
		setStatus(
			currentSummary.totalEntries
				? "Statistics updated"
				: "No synced entries yet",
			{ state: "online" },
		);
	} catch (error) {
		if (error instanceof ApiError && error.status === 401) {
			window.location.replace("login.html");
			return;
		}

		currentSummary = summarizeEntries([]);
		renderSummary(currentSummary);
		setStatus(error.message || "Unable to load statistics", { isError: true });
	} finally {
		clearLocalDataButton.disabled = false;
	}
}

logoutButton.addEventListener("click", async () => {
	logoutButton.disabled = true;
	try {
		await apiRequest("/api/logout", { method: "POST" });
		window.location.replace("login.html");
	} catch (error) {
		setStatus(error.message || "Could not sign out", { isError: true });
	} finally {
		logoutButton.disabled = false;
	}
});

clearLocalDataButton.addEventListener("click", async () => {
	const warning = currentUser
		? "Clear Music Journal data cached on this device and sign out? Your account and synced journal entries in MongoDB will not be deleted."
		: "Clear Music Journal data stored in this browser? This does not delete synced journal entries in MongoDB.";

	if (!window.confirm(warning)) {
		return;
	}

	clearLocalDataButton.disabled = true;
	try {
		if (currentUser) {
			await apiRequest("/api/logout", { method: "POST" });
		}

		removeMusicJournalLocalData();
		window.location.replace(currentUser ? "login.html" : "index.html");
	} catch (error) {
		setStatus(
			error.message || "Could not sign out before clearing local data",
			{ isError: true },
		);
		clearLocalDataButton.disabled = false;
	}
});

window.addEventListener("resize", () => {
	window.cancelAnimationFrame(resizeFrame);
	resizeFrame = window.requestAnimationFrame(() => renderSummary(currentSummary));
});

renderSummary(currentSummary);
updateAccountUi();
initializeStats();

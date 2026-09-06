import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(new URL("../../public/script.js", import.meta.url), "utf8");
const anonymousKey = "musicJournalEntries:anonymous";
const user = { id: "1234567890abcdef12345678", email: "journal@example.invalid" };
const userKey = `musicJournalEntries:user:${user.id}`;
const example = {
	id: "client:example", clientId: "original-client", createdAt: "2026-08-10T12:00:00.000Z",
	mood: "Focused", intensity: 8, songTitle: "Original song", artist: "Original artist",
	songUrl: "https://example.com/song", note: "Original note", pending: false,
};
const serverEntry = ({ id, pending: _pending, songUrl, ...entry }) => ({ ...entry, _id: id, songLink: songUrl });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const response = (data, status = 200) => new Response(JSON.stringify(data), {
	status, headers: { "Content-Type": "application/json" },
});

class Element {
	constructor() {
		this.value = "";
		this.textContent = "";
		this.disabled = false;
		this.dataset = {};
		this.children = [];
		this.selectors = {};
		this.listeners = new Map();
		this.attributes = {};
		this.classes = new Set();
		this.classList = {
			toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
			remove: (name) => this.classes.delete(name),
		};
	}
	addEventListener(name, handler) {
		const listeners = this.listeners.get(name) || [];
		listeners.push(handler);
		this.listeners.set(name, listeners);
	}
	async dispatch(name) {
		for (const handler of this.listeners.get(name) || []) {
			await handler({ preventDefault() {} });
		}
	}
	querySelector(selector) { return this.selectors[selector]; }
	querySelectorAll(selector) {
		if (selector === ".entry-card") return this.children;
		return this.selectors[selector] || [];
	}
	setAttribute(name, value) { this.attributes[name] = value; }
	append(child) { this.children.push(child.card || child); }
	replaceChildren() { this.children = []; }
	focus() { this.focused = true; }
	scrollIntoView() {}
	remove() {}
}

async function journal({ signedIn = false, initialEntries = [example], request, confirm = true } = {}) {
	const ids = ["journalForm", "timeline", "entryTemplate", "emptyState", "emptyStateTitle", "emptyStateMessage",
		"moodFilter", "intensity", "intensityValue", "formMessage", "syncStatus", "entryCount", "topMood",
		"averageIntensity", "clearForm", "clearLocalDataButton", "exportEntries", "signInLink", "accountActions",
		"accountEmail", "logoutButton", "entryTitle", "saveEntryButton", "cancelEditButton"];
	const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
	const form = elements.journalForm;
	form.elements = Object.fromEntries(["mood", "songTitle", "artist", "songUrl", "note"].map((name) => [name, new Element()]));
	form.elements.intensity = elements.intensity;
	form.selectors["input, textarea, button"] = [...Object.values(form.elements), elements.saveEntryButton, elements.cancelEditButton];
	form.reset = () => Object.values(form.elements).forEach((field) => { field.value = ""; });
	form.reportValidity = () => Boolean(form.elements.songTitle.value.trim());
	elements.entryTemplate.content = {
		cloneNode() {
			const fragment = new Element();
			const card = new Element();
			for (const selector of [".entry-date", ".entry-mood", ".entry-intensity", "h3", ".entry-artist", ".entry-note", ".entry-sync", ".entry-link", ".editbutton", ".deletebutton"]) {
				fragment.selectors[selector] = new Element();
			}
			fragment.card = card;
			fragment.selectors[".entry-card"] = card;
			card.selectors = { ...fragment.selectors, button: [fragment.selectors[".editbutton"], fragment.selectors[".deletebutton"]] };
			return fragment;
		},
	};
	const storage = new Map([[signedIn ? userKey : anonymousKey, JSON.stringify(initialEntries)]]);
	const document = new Element();
	document.visibilityState = "visible";
	document.querySelector = (selector) => elements[selector.slice(1)];
	document.createElement = () => new Element();
	const window = new Element();
	const confirmations = [];
	window.confirm = (message) => { confirmations.push(message); return confirm; };
	window.setTimeout = () => 1;
	window.clearTimeout = () => {};
	const requests = [];
	let remoteEntries = initialEntries.filter((entry) => !entry.pending).map(serverEntry);
	const context = vm.createContext({
		document, window, URL, Intl, console,
		localStorage: {
			getItem: (key) => storage.get(key) ?? null,
			setItem: (key, value) => storage.set(key, value),
			removeItem: (key) => storage.delete(key),
			get length() { return storage.size; },
			key: (index) => [...storage.keys()][index],
		},
		FormData: class { constructor(target) { this.target = target; } get(key) { return this.target.elements[key].value; } },
		fetch: async (url, options) => {
			const call = { url, ...options, data: options.body ? JSON.parse(options.body) : null };
			requests.push(call);
			const customResponse = await request?.(call);
			if (customResponse) return customResponse;
			if (url === "/api/user") return signedIn ? response({ user }) : response({ error: "Authentication required" }, 401);
			if (url === "/api/moods" && options.method === "POST") {
				const entry = { ...call.data, _id: `client:${call.data.clientId}`, createdAt: example.createdAt };
				remoteEntries.push(entry);
				return response({ data: entry }, 201);
			}
			if (url === "/api/moods") return response({ data: remoteEntries });
			if (options.method === "PUT") {
				const id = decodeURIComponent(url.split("/").at(-1));
				const entry = { ...remoteEntries.find((entry) => entry._id === id), ...call.data };
				remoteEntries = remoteEntries.map((candidate) => candidate._id === id ? entry : candidate);
				return response({ data: entry });
			}
			if (options.method === "DELETE") return response({ deletedCount: 1 });
			throw new Error(`Unexpected request: ${url}`);
		},
	});
	vm.runInContext(script, context);
	await tick();
	return {
		elements, form, storage, requests, confirmations, window, document,
		entries: () => JSON.parse(vm.runInContext("JSON.stringify(entries)", context)),
		card: (id = example.id) => elements.timeline.children.find((card) => card.dataset.entryId === id),
	};
}

test("anonymous Edit fills the form, preserves identity/date, persists and updates statistics", async () => {
	const app = await journal();
	await app.card().querySelector(".editbutton").dispatch("click");
	for (const field of ["mood", "intensity", "songTitle", "artist", "songUrl", "note"]) {
		assert.equal(String(app.form.elements[field].value), String(example[field]));
	}
	assert.equal(app.elements.entryTitle.textContent, "Edit entry");
	assert.equal(app.elements.saveEntryButton.textContent, "Save changes");
	assert.ok(app.form.elements.songTitle.focused);
	app.form.elements.songTitle.value = "Edited locally";
	app.form.elements.intensity.value = "2";
	app.form.elements.mood.value = "Calm";
	await app.form.dispatch("submit");
	assert.deepEqual(app.entries(), [{ ...example, songTitle: "Edited locally", intensity: 2, mood: "Calm" }]);
	assert.deepEqual(JSON.parse(app.storage.get(anonymousKey)), app.entries());
	assert.equal(app.elements.entryCount.textContent, "1");
	assert.equal(app.elements.averageIntensity.textContent, "2.0");
	assert.equal(app.elements.topMood.textContent, "Calm");
	assert.equal(app.elements.entryTitle.textContent, "Log a mood and song");
	assert.equal(app.requests.length, 1);
});

test("cancel and clear restore create mode without changing the selected entry", async () => {
	const app = await journal();
	for (const button of [app.elements.cancelEditButton, app.elements.clearForm]) {
		await app.card().querySelector(".editbutton").dispatch("click");
		app.form.elements.songTitle.value = "Discarded draft";
		await button.dispatch("click");
		assert.equal(app.elements.saveEntryButton.textContent, "Save entry");
		assert.equal(app.form.elements.songTitle.value, "");
		assert.deepEqual(app.entries(), [example]);
	}
	app.form.elements.songTitle.value = "New entry";
	await app.form.dispatch("submit");
	assert.equal(app.entries().length, 2);
	assert.equal(app.entries()[1].id, example.id);
});

test("pending edits stay local with the same client ID and sync once with the edited values", async () => {
	let offline = true;
	const pending = { ...example, id: "local-id", pending: true };
	const app = await journal({ signedIn: true, initialEntries: [pending], request: ({ url }) => {
		if (offline && url !== "/api/user") throw new TypeError("Offline");
	} });
	const requestCount = app.requests.length;
	await app.card(pending.id).querySelector(".editbutton").dispatch("click");
	app.form.elements.songTitle.value = "Edited before sync";
	await app.form.dispatch("submit");
	assert.deepEqual(app.entries(), [{ ...pending, songTitle: "Edited before sync" }]);
	assert.equal(app.requests.length, requestCount);
	offline = false;
	await app.window.dispatch("online");
	assert.equal(app.entries().length, 1);
	assert.equal(app.entries()[0].pending, false);
	assert.equal(app.entries()[0].songTitle, "Edited before sync");
	assert.equal(app.entries()[0].clientId, example.clientId);
	assert.equal(app.requests.filter((call) => call.method === "POST").length, 2); // Failed initial attempt plus one retry.
});

test("local and pending Delete remove only the clicked entry without an API call", async () => {
	for (const signedIn of [false, true]) {
		const selected = { ...example, pending: signedIn };
		const other = { ...selected, id: "second-entry", clientId: "second-client" };
		const app = await journal({ signedIn, initialEntries: [selected, other], request: ({ url }) => {
			if (url !== "/api/user") throw new TypeError("Offline");
		} });
		const beforeCount = app.requests.length;
		await app.card().querySelector(".editbutton").dispatch("click");
		await app.card().querySelector(".deletebutton").dispatch("click");
		assert.deepEqual(app.entries(), [other]);
		assert.equal(app.requests.length, beforeCount);
		assert.equal(app.elements.entryCount.textContent, "1");
		assert.equal(app.elements.entryTitle.textContent, "Log a mood and song");
		assert.deepEqual(JSON.parse(app.storage.get(signedIn ? userKey : anonymousKey)), [other]);
	}
});

test("synced Edit sends PUT and uses the normalized server document without creating another entry", async () => {
	const app = await journal({ signedIn: true });
	await app.card().querySelector(".editbutton").dispatch("click");
	app.form.elements.songTitle.value = "Updated song";
	app.form.elements.songUrl.value = "https://example.com/edited-song";
	await app.form.dispatch("submit");
	const mutations = app.requests.filter((call) => call.method);
	assert.equal(mutations.length, 1);
	assert.equal(mutations[0].url, "/api/moods/client%3Aexample");
	assert.equal(mutations[0].method, "PUT");
	assert.equal(mutations[0].credentials, "include");
	assert.equal(mutations[0].data.songLink, "https://example.com/edited-song");
	assert.deepEqual(app.entries(), [{ ...example, songTitle: "Updated song", songUrl: "https://example.com/edited-song" }]);
	assert.deepEqual(JSON.parse(app.storage.get(userKey)), app.entries());
});

test("synced Delete confirms, sends only the selected ID, and prevents repeat requests and refresh races", async () => {
	let finish;
	const deletion = new Promise((resolve) => { finish = resolve; });
	const app = await journal({ signedIn: true, request: (call) => call.method === "DELETE" ? deletion : undefined });
	const button = app.card().querySelector(".deletebutton");
	const firstClick = button.dispatch("click");
	await tick();
	assert.equal(button.disabled, true);
	await button.dispatch("click");
	await app.window.dispatch("online");
	assert.equal(app.requests.filter((call) => call.method === "DELETE").length, 1);
	assert.equal(app.requests.filter((call) => call.url === "/api/moods").length, 1);
	assert.deepEqual(app.entries(), [example]);
	finish(response({ deletedCount: 1 }));
	await firstClick;
	assert.deepEqual(app.entries(), []);
	assert.equal(app.elements.entryCount.textContent, "0");
	assert.equal(app.elements.averageIntensity.textContent, "–");
	assert.equal(app.confirmations.length, 1);
	assert.deepEqual(app.requests.at(-1).data, { moodIds: [example.id] });
	assert.equal(app.requests.at(-1).credentials, "include");
	assert.equal(app.elements.saveEntryButton.disabled, false);
});

test("declining the delete confirmation leaves the journal unchanged", async () => {
	const app = await journal({ signedIn: true, confirm: false });
	await app.card().querySelector(".deletebutton").dispatch("click");
	assert.deepEqual(app.entries(), [example]);
	assert.equal(app.requests.filter((call) => call.method === "DELETE").length, 0);
});

test("background sync pauses for the editing draft and duplicate submissions are ignored", async () => {
	let finish;
	const update = new Promise((resolve) => { finish = resolve; });
	const app = await journal({ signedIn: true, request: (call) => call.method === "PUT" ? update : undefined });
	await app.card().querySelector(".editbutton").dispatch("click");
	app.form.elements.songTitle.value = "Draft song";
	await app.window.dispatch("online");
	const firstSubmit = app.form.dispatch("submit");
	await tick();
	await app.form.dispatch("submit");
	await app.card().querySelector(".deletebutton").dispatch("click");
	await app.document.dispatch("visibilitychange");
	assert.equal(app.requests.length, 3); // Session, initial GET, one PUT.
	finish(response({ data: serverEntry({ ...example, songTitle: "Draft song" }) }));
	await firstSubmit;
	assert.equal(app.entries()[0].songTitle, "Draft song");
});

test("in-flight synchronization disables entry mutations until it finishes", async () => {
	let finish;
	let pause = false;
	const refresh = new Promise((resolve) => { finish = resolve; });
	const app = await journal({ signedIn: true, request: (call) => pause && call.url === "/api/moods" ? refresh : undefined });
	pause = true;
	const syncing = app.window.dispatch("online");
	await tick();
	assert.equal(app.card().querySelector(".deletebutton").disabled, true);
	await app.card().querySelector(".deletebutton").dispatch("click");
	await app.card().querySelector(".editbutton").dispatch("click");
	assert.equal(app.elements.entryTitle.textContent, "Log a mood and song");
	finish(response({ data: [serverEntry(example)] }));
	await syncing;
	assert.equal(app.card().querySelector(".deletebutton").disabled, false);
	assert.deepEqual(app.entries(), [example]);
});

test("failed edits and deletions preserve cached entries and display errors; 401 isolates account data", async () => {
	for (const status of [0, 401, 404, 500]) {
		for (const method of ["PUT", "DELETE"]) {
			const app = await journal({ signedIn: true, request: (call) => {
				if (call.method !== method) return;
				if (status === 0) throw new TypeError("Network unavailable");
				return response({ error: "Request rejected" }, status);
			} });
			if (method === "PUT") {
				await app.card().querySelector(".editbutton").dispatch("click");
				app.form.elements.songTitle.value = "Unsaved draft";
				await app.form.dispatch("submit");
			} else {
				await app.card().querySelector(".deletebutton").dispatch("click");
			}
			assert.deepEqual(JSON.parse(app.storage.get(userKey)), [example]);
			assert.ok(app.elements.formMessage.classes.has("is-error"));
			assert.deepEqual(app.entries(), status === 401 ? [] : [example]);
			if (status === 401) {
				assert.equal(app.elements.syncStatus.textContent, "Session expired");
				assert.equal(app.elements.entryTitle.textContent, "Log a mood and song");
			} else if (method === "PUT") {
				assert.equal(app.form.elements.songTitle.value, "Unsaved draft");
				assert.equal(app.elements.saveEntryButton.textContent, "Save changes");
			}
		}
	}
});

test("rerendered and filtered cards keep ID-based listeners without accumulating handlers", async () => {
	const other = { ...example, id: "other-entry", mood: "Calm" };
	const app = await journal({ initialEntries: [example, other] });
	for (let index = 0; index < 3; index += 1) {
		app.elements.moodFilter.value = "Calm";
		await app.elements.moodFilter.dispatch("change");
	}
	const card = app.card(other.id);
	assert.equal(card.querySelector(".editbutton").listeners.get("click").length, 1);
	assert.equal(card.querySelector(".deletebutton").listeners.get("click").length, 1);
	await card.querySelector(".deletebutton").dispatch("click");
	assert.deepEqual(app.entries(), [example]);
});

test("an edited pending entry survives an idempotent POST replay with older server values", async () => {
	let offline = true;
	let remote = serverEntry(example);
	const app = await journal({ signedIn: true, initialEntries: [{ ...example, id: "local-id", pending: true }], request: (call) => {
		if (call.url === "/api/user") return;
		if (offline) throw new TypeError("Response lost");
		if (call.method === "POST") return response({ data: remote }, 201);
		if (call.method === "PUT") {
			remote = { ...remote, ...call.data };
			return response({ data: remote });
		}
		return response({ data: [remote] });
	} });
	await app.card("local-id").querySelector(".editbutton").dispatch("click");
	app.form.elements.songTitle.value = "Edited after response was lost";
	await app.form.dispatch("submit");
	offline = false;
	await app.window.dispatch("online");
	assert.deepEqual(app.entries(), [{ ...example, songTitle: "Edited after response was lost" }]);
	assert.equal(app.requests.filter((call) => call.method === "PUT").length, 1);
});

test("invalid successful mutation payloads never replace or remove an entry", async () => {
	for (const method of ["PUT", "DELETE"]) {
		const app = await journal({ signedIn: true, request: (call) => {
			if (call.method === method) return response(method === "PUT" ? { data: { matchedCount: 1, modifiedCount: 1 } } : { deletedCount: 0 });
		} });
		if (method === "PUT") {
			await app.card().querySelector(".editbutton").dispatch("click");
			await app.form.dispatch("submit");
		} else {
			await app.card().querySelector(".deletebutton").dispatch("click");
		}
		assert.deepEqual(app.entries(), [example]);
		assert.deepEqual(JSON.parse(app.storage.get(userKey)), [example]);
		assert.ok(app.elements.formMessage.classes.has("is-error"));
	}
});

const API_BASE = globalThis.MUSIC_JOURNAL_API_BASE || getStoredValue("musicJournalApiBase") || "";
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authSubmit = document.querySelector("#authSubmit");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const loginMessage = document.querySelector("#loginMessage");
const passwordHint = document.querySelector("#passwordHint");
let authMode = "login";

function getStoredValue(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function showMessage(message, { isError = false } = {}) {
	loginMessage.textContent = message;
	loginMessage.classList.toggle("is-error", isError);
}

async function request(path, options = {}) {
	let response;
	try {
		response = await fetch(`${API_BASE}${path}`, {
			credentials: "include",
			...options,
		});
	} catch {
		throw new Error("Unable to reach the Music Journal server");
	}
	const contentType = response.headers.get("content-type") || "";
	const payload = contentType.includes("application/json") ? await response.json() : null;

	if (!response.ok) {
		throw new Error(payload?.error || "The request could not be completed");
	}

	return payload;
}

function setAuthMode(nextMode) {
	authMode = nextMode === "signup" ? "signup" : "login";
	const isSignup = authMode === "signup";
	authTitle.textContent = isSignup ? "Create account" : "Sign in";
	authSubmit.textContent = isSignup ? "Create account" : "Sign in";
	authForm.elements.password.autocomplete = isSignup ? "new-password" : "current-password";
	authForm.elements.password.minLength = isSignup ? 8 : 1;
	passwordHint.textContent = isSignup ? "Use 8–72 characters." : "";
	showMessage("");

	authTabs.forEach((tab) => {
		const isActive = tab.dataset.authMode === authMode;
		tab.classList.toggle("is-active", isActive);
		tab.setAttribute("aria-pressed", String(isActive));
	});
}

authTabs.forEach((tab) => {
	tab.addEventListener("click", () => {
		setAuthMode(tab.dataset.authMode);
	});
});

authForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	showMessage("");

	if (!authForm.reportValidity()) {
		return;
	}

	const formData = new FormData(authForm);
	const email = String(formData.get("email") || "").trim().toLowerCase();
	const password = String(formData.get("password") || "");
	const endpoint = authMode === "signup" ? "/api/signup" : "/api/login";

	authSubmit.disabled = true;
	try {
		await request(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
		window.location.replace("index.html");
	} catch (error) {
		showMessage(error.message || "Unable to reach the server", { isError: true });
	} finally {
		authSubmit.disabled = false;
	}
});

request("/api/user")
	.then(() => window.location.replace("index.html"))
	.catch(() => setAuthMode("login"));

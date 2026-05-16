const API_BASE = globalThis.MUSIC_JOURNAL_API_BASE || getStoredValue("musicJournalApiBase") || "";
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authSubmit = document.querySelector("#authSubmit");
const authTabs = document.querySelectorAll("[data-auth-mode]");
const loginMessage = document.querySelector("#loginMessage");
let authMode = "login";

function getStoredValue(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function showMessage(message) {
	loginMessage.textContent = message;
}

async function submitAuth(endpoint, email, password) {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email, password }),
		credentials: "include",
	});

	if (!response.ok) {
		throw new Error("Authentication failed");
	}
}

function setAuthMode(nextMode) {
	authMode = nextMode;
	const isSignup = authMode === "signup";
	authTitle.textContent = isSignup ? "Sign up" : "Sign in";
	authSubmit.textContent = isSignup ? "Sign up" : "Sign in";
	authForm.elements.password.autocomplete = isSignup ? "new-password" : "current-password";
	showMessage("");

	authTabs.forEach((tab) => {
		const isActive = tab.dataset.authMode === authMode;
		tab.classList.toggle("is-active", isActive);
		tab.setAttribute("aria-selected", String(isActive));
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

	const formData = new FormData(authForm);
	const email = formData.get("email").trim();
	const password = formData.get("password");

	try {
		if (authMode === "signup") {
			await submitAuth("/api/signup", email, password);
		}

		await submitAuth("/api/login", email, password);
		window.location.href = "index.html";
	} catch {
		showMessage(authMode === "signup" ? "Sign up failed. Try another email or a longer password." : "Sign in failed. Check your email and password.");
	}
});

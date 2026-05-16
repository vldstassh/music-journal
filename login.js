const API_BASE = globalThis.MUSIC_JOURNAL_API_BASE || getStoredValue("musicJournalApiBase") || "";
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");

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

loginForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	showMessage("");

	const formData = new FormData(loginForm);

	try {
		const response = await fetch(`${API_BASE}/api/login`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: formData.get("email").trim(),
				password: formData.get("password"),
			}),
			credentials: "include",
		});

		if (!response.ok) {
			throw new Error("Login failed");
		}

		window.location.href = "index.html";
	} catch {
		showMessage("Login failed. Check your email and password.");
	}
});

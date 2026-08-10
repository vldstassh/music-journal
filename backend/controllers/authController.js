import {
	createUser,
	findUserByEmail,
	findUserById,
} from "../models/authModel.js";
import {
	hashPassword,
	comparePasswordToHash,
} from "../middleware/passwordHash.js";
import { summarizeError } from "../lib/logging.js";
import { validateEmail, validatePassword } from "../lib/validation.js";

export const SESSION_COOKIE_NAME = "music-journal.sid";

function regenerateSession(req) {
	return new Promise((resolve, reject) => {
		req.session.regenerate((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

function saveSession(req) {
	return new Promise((resolve, reject) => {
		req.session.save((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

async function establishSession(req, userId) {
	await regenerateSession(req);
	req.session.userId = userId.toString();
	await saveSession(req);
}

function reportAuthError(operation, error, res) {
	console.error(`Authentication ${operation} failed:`, summarizeError(error));
	return res.status(500).json({ error: "Authentication service unavailable" });
}

export async function signupUserController(req, res) {
	const emailResult = validateEmail(req.body?.email);
	const passwordResult = validatePassword(req.body?.password, {
		minimumLength: 8,
		maximumBytes: 72,
	});

	if (emailResult.error || passwordResult.error) {
		return res.status(400).json({ error: emailResult.error || passwordResult.error });
	}

	try {
		const passwordHash = await hashPassword(passwordResult.value);
		const user = await createUser(emailResult.value, passwordHash);

		if (!user) {
			return res.status(409).json({ error: "An account with this email already exists" });
		}

		await establishSession(req, user._id);
		return res.status(201).json({ user: { id: user._id, email: user.email } });
	} catch (error) {
		return reportAuthError("signup", error, res);
	}
}

export async function loginUserController(req, res) {
	const emailResult = validateEmail(req.body?.email);
	const passwordResult = validatePassword(req.body?.password, { maximumBytes: 72 });

	if (emailResult.error || passwordResult.error) {
		return res.status(400).json({ error: emailResult.error || passwordResult.error });
	}

	try {
		const user = await findUserByEmail(emailResult.value);
		const passwordMatches = user
			? await comparePasswordToHash(passwordResult.value, user.password)
			: false;

		if (!user || !passwordMatches) {
			return res.status(401).json({ error: "Invalid email or password" });
		}

		await establishSession(req, user._id);
		return res.status(200).json({ user: { id: user._id, email: user.email } });
	} catch (error) {
		return reportAuthError("login", error, res);
	}
}

export async function logoutUserController(req, res) {
	if (!req.session) {
		return res.sendStatus(204);
	}

	return req.session.destroy((error) => {
		if (error) {
			return reportAuthError("logout", error, res);
		}

		res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
		return res.sendStatus(204);
	});
}

export async function getCurrentUserController(req, res) {
	try {
		const user = await findUserById(req.session.userId);

		if (!user) {
			return req.session.destroy(() => res.sendStatus(401));
		}

		return res.json({ user: { id: user._id, email: user.email } });
	} catch (error) {
		return reportAuthError("lookup", error, res);
	}
}

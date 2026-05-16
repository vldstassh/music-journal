import {
	signupUserModel,
	loginUserModel,
	getCurrentUser,
} from "../models/authModel.js";
import {
	hashPassword,
	comparePasswordToHash,
} from "../middleware/passwordHash.js";
import { ObjectId } from "mongodb";

// controller for verifing password and email when users want to signup
export async function signupUserController(req, res) {
	try {
		const userEmail = req.body.email;
		const userPassword = req.body.password;

		let regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

		if (!regex.test(userEmail)) {
			return res.status(400).json({ error: "invalid email" });
		}

		if (!userPassword || userPassword.length < 5) {
			return res
				.status(400)
				.json({ error: "password has to contain 5 chars" });
		}

		const hash = await hashPassword(userPassword);

		const result = await signupUserModel(userEmail, hash);

		if (result == false) {
			return res.status(409).json({ error: "email in use" });
		}

		return res.sendStatus(201);
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
}

export async function loginUserController(req, res) {
	try {
		const userEmail = req.body.email;
		const userPassword = req.body.password;

		if (!userEmail || !userPassword) {
			return res.status(400).json({ error: "email and password are required" });
		}

		const user = await loginUserModel(userEmail);

		if (!user) {
			return res.status(401).json({ error: "invalid email or password" });
		}

		const passwordCheck = await comparePasswordToHash(
			userPassword,
			user.password,
		);

		if (!passwordCheck) {
			return res.status(401).json({ error: "invalid email or password" });
		}

		req.session.userId = user._id;
		return res.status(200).json({ message: "logged in" });
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
}

export async function getCurrentUserController(req, res) {
	try {
		let userId = new ObjectId(req.session.userId);
		const user = await getCurrentUser(userId);
		return res.json(user);
	} catch (err) {
		return res.status(500).json({ error: err.message });
	}
}

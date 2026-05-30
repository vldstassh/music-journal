import { connectDB } from "../connection/connection.js";

let userIndexesPromise;

async function ensureUserIndexes(db) {
	if (!userIndexesPromise) {
		userIndexesPromise = db.collection("users")
			.createIndex({ email: 1 }, { unique: true })
			.catch((error) => {
				userIndexesPromise = null;
				throw error;
			});
	}

	await userIndexesPromise;
}

// sends email and password to db and returns result
export async function signupUserModel(userEmail, userPassword) {
	const db = await connectDB();
	await ensureUserIndexes(db);

	const doc = { email: userEmail, password: userPassword };
	const existingUser = await db
		.collection("users")
		.findOne({ email: userEmail });

	if (existingUser) {
		return false;
	}

	try {
		const result = await db.collection("users").insertOne(doc);

		return result;
	} catch (error) {
		if (error.code === 11000) {
			return false;
		}

		throw error;
	}
}

export async function loginUserModel(userEmail) {
	const db = await connectDB();
	const user = await db.collection("users").findOne({ email: userEmail });

	return user;
}

export async function getCurrentUser(userId) {
	const db = await connectDB();
	const user = await db.collection("users").findOne(
		{ _id: userId },
		{ projection: { password: 0 } },
	);

	return user;
}

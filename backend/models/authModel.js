import { ObjectId } from "mongodb";
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

export async function createUser(email, passwordHash) {
	const db = await connectDB();
	await ensureUserIndexes(db);
	const users = db.collection("users");
	const existingUser = await users.findOne(
		{ email },
		{ collation: { locale: "en", strength: 2 } },
	);

	if (existingUser) {
		return null;
	}

	const user = {
		email,
		password: passwordHash,
		createdAt: new Date(),
	};

	try {
		const result = await users.insertOne(user);
		return { _id: result.insertedId, ...user };
	} catch (error) {
		if (error.code === 11000) {
			return null;
		}

		throw error;
	}
}

export async function findUserByEmail(email) {
	const db = await connectDB();
	return db.collection("users").findOne(
		{ email },
		{ collation: { locale: "en", strength: 2 } },
	);
}

export async function findUserById(userId) {
	if (!ObjectId.isValid(userId)) {
		return null;
	}

	const db = await connectDB();
	return db.collection("users").findOne(
		{ _id: new ObjectId(userId) },
		{ projection: { password: 0 } },
	);
}

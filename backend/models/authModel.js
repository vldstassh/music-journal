import { connectDB } from "../connection/connection.js";

// sends email and password to db and returns result
export async function signupUserModel(userEmail, userPassword) {
	const db = await connectDB();
	const doc = { email: userEmail, password: userPassword };
	const existingUser = await db
		.collection("users")
		.findOne({ email: userEmail });

	if (existingUser) {
		return false;
	}

	const result = await db.collection("users").insertOne(doc);

	return result;
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

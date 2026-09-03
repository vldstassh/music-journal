import { createHash } from "node:crypto";
import { ObjectId } from "mongodb";
import { connectDB } from "../connection/connection.js";

let moodIndexesPromise;

function normalizeUserId(userId) {
	if (!ObjectId.isValid(userId)) {
		throw new TypeError("Invalid session user ID");
	}

	return userId.toString();
}

async function ensureMoodIndexes(db) {
	if (!moodIndexesPromise) {
		const moods = db.collection("moods");
		moodIndexesPromise = Promise.all([
			moods.createIndex(
				{ userId: 1, createdAt: -1 },
				{ name: "moods_user_created_at" },
			),
			moods.createIndex(
				{ userId: 1, clientId: 1 },
				{ name: "moods_user_client" },
			),
		]).catch((error) => {
			moodIndexesPromise = null;
			throw error;
		});
	}

	await moodIndexesPromise;
}

export async function createMoodModel(moodData) {
	const db = await connectDB();
	await ensureMoodIndexes(db);
	const moods = db.collection("moods");
	const document = { ...moodData, userId: normalizeUserId(moodData.userId) };

	if (document.clientId) {
		const existingMood = await moods.findOne({
			userId: document.userId,
			clientId: document.clientId,
		});

		if (existingMood) {
			return existingMood;
		}

		document._id = `client:${createHash("sha256")
			.update(`${document.userId}\0${document.clientId}`)
			.digest("hex")}`;

		try {
			await moods.insertOne(document);
			return document;
		} catch (error) {
			if (error.code === 11000) {
				return moods.findOne({ _id: document._id });
			}

			throw error;
		}
	}

	const result = await moods.insertOne(document);
	return { _id: result.insertedId, ...document };
}

export async function getMoodsModel(userId) {
	const db = await connectDB();
	await ensureMoodIndexes(db);
	const normalizedUserId = normalizeUserId(userId);

	return db
		.collection("moods")
		.find({
			userId: {
				$in: [normalizedUserId, new ObjectId(normalizedUserId)],
			},
		})
		.sort({ createdAt: -1 })
		.toArray();
}

export async function editMoodModel(
	id,
	userId,
	mood,
	intensity,
	songTitle,
	artist,
	songLink,
	note,
) {
	const db = await connectDB();
	const normalizedUserId = normalizeUserId(userId);
	const result = await db.collection("moods").updateOne(
		{
			_id: id,
			userId: normalizedUserId,
		},
		{
			$set: {
				mood: mood,
				intensity: intensity,
				songTitle: songTitle,
				artist: artist,
				songLink: songLink,
				note: note,
			},
		},
	);

	return result;
}

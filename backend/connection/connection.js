import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

export function getMongoUrl() {
	if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
		throw new Error("Missing DB_USER or DB_PASSWORD environment variable");
	}

	const user = encodeURIComponent(process.env.DB_USER);
	const password = encodeURIComponent(process.env.DB_PASSWORD);
	return `mongodb+srv://${user}:${password}@music-journal.85gqdwy.mongodb.net/?appName=music-journal`;
}

export function getDbName() {
	if (!process.env.DB_NAME) {
		throw new Error("Missing DB_NAME environment variable");
	}

	return process.env.DB_NAME;
}

const client = new MongoClient(getMongoUrl(), {
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

let db;

export async function connectDB() {
	try {
		if (!db) {
			await client.connect();
			db = client.db(getDbName());
		}
		return db;
	} catch (err) {
		console.error(err);
		throw err;
	}
}

import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

let client;
let db;
let connectionPromise;

export function getMongoUrl() {
	if (process.env.MONGODB_URI) {
		return process.env.MONGODB_URI;
	}

	if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
		throw new Error("Missing MONGODB_URI (or legacy DB_USER and DB_PASSWORD) environment variable");
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

function getClient() {
	if (!client) {
		client = new MongoClient(getMongoUrl(), {
			serverApi: {
				version: ServerApiVersion.v1,
				strict: true,
				deprecationErrors: true,
			},
		});
	}

	return client;
}

export function connectMongoClient() {
	if (!connectionPromise) {
		connectionPromise = getClient()
			.connect()
			.catch((error) => {
				connectionPromise = null;
				throw error;
			});
	}

	return connectionPromise;
}

export async function connectDB() {
	if (!db) {
		const connectedClient = await connectMongoClient();
		db = connectedClient.db(getDbName());
	}

	return db;
}

export async function closeDB() {
	if (client) {
		await client.close();
	}

	client = undefined;
	db = undefined;
	connectionPromise = undefined;
}

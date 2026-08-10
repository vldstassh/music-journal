import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

let client;
let db;
let connectionPromise;

export function getMongoUrl() {
	if (!process.env.MONGODB_URI) {
		throw new Error("Missing MONGODB_URI environment variable");
	}

	return process.env.MONGODB_URI;
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
		maxPoolSize: 10,
		minPoolSize: 0,
		maxIdleTimeMS: 60_000,
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

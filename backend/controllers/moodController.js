import {
	createMoodModel,
	getMoodsModel,
	editMoodModel,
} from "../models/moodModel.js";
import { summarizeError } from "../lib/logging.js";
import { validateMoodEntry } from "../lib/validation.js";

function reportMoodError(operation, error, res) {
	console.error(`Mood ${operation} failed:`, summarizeError(error));
	return res.status(500).json({ error: "Journal service unavailable" });
}

function serializeMood({ userId: _userId, ...mood }) {
	return mood;
}

export async function createMood(req, res) {
	const validation = validateMoodEntry(req.body);

	if (validation.error) {
		return res.status(400).json({ error: validation.error });
	}

	try {
		const newMood = {
			userId: req.session.userId,
			mood: validation.value.mood,
			intensity: validation.value.intensity,
			songTitle: validation.value.songTitle,
			artist: validation.value.artist,
			songLink: validation.value.songLink,
			note: validation.value.note,
			createdAt: new Date(),
		};

		if (validation.value.clientId) {
			newMood.clientId = validation.value.clientId;
		}

		const savedMood = await createMoodModel(newMood);
		return res.status(201).json({ data: serializeMood(savedMood) });
	} catch (error) {
		return reportMoodError("creation", error, res);
	}
}

export async function getMoods(req, res) {
	try {
		const moods = await getMoodsModel(req.session.userId);
		return res.status(200).json({ data: moods.map(serializeMood) });
	} catch (error) {
		return reportMoodError("lookup", error, res);
	}
}

export async function editMood(req, res) {
	try {
		const validation = validateMoodEntry(req.body);
		if (validation.error) {
			return res.status(400).json({ error: validation.error });
		}
		const updatedMood = await editMoodModel(
			req.params.id,
			req.session.userId,
			validation.value.mood,
			validation.value.intensity,
			validation.value.songTitle,
			validation.value.artist,
			validation.value.songLink,
			validation.value.note,
		);
		return res.status(200).json({ data: serializeMood(updatedMood) });
	} catch (error) {
		return reportMoodError("edit", error, res);
	}
}

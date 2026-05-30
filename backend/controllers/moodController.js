import {
    createMoodModel,
    getMoodsModel
} from "../models/moodModel.js";

const allowedMoods = new Set(["Joyful", "Calm", "Focused", "Anxious", "Sad", "Angry"]);

function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function cleanOptionalText(value) {
    return value === undefined || value === null ? "" : cleanText(value);
}

function cleanSongLink(value) {
    const songLink = cleanOptionalText(value);

    if (!songLink) {
        return "";
    }

    try {
        const url = new URL(songLink);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        return url.toString();
    } catch {
        return null;
    }
}

const createMood = async (req, res) => {

    try {

        const { mood, songTitle, artist, songLink, songUrl, intensity, note, clientId } = req.body;
        const cleanedMood = cleanText(mood);
        const cleanedSongTitle = cleanText(songTitle);
        const cleanedArtist = cleanOptionalText(artist);
        const cleanedNote = cleanOptionalText(note);
        const cleanedClientId = cleanOptionalText(clientId);
        const rawSongLink = cleanOptionalText(songLink) || cleanOptionalText(songUrl);
        const cleanedSongLink = cleanSongLink(rawSongLink);
        const cleanedIntensity = intensity === undefined || intensity === ""
            ? 5
            : Number(intensity);

        if (!allowedMoods.has(cleanedMood)) {
            return res.status(400).json({
                message: "invalid mood"
            });
        }

        if (!cleanedSongTitle) {
            return res.status(400).json({
                message: "songTitle is required"
            });
        }

        if (!Number.isInteger(cleanedIntensity) || cleanedIntensity < 1 || cleanedIntensity > 10) {
            return res.status(400).json({
                message: "intensity must be an integer between 1 and 10"
            });
        }

        if (cleanedSongLink === null) {
            return res.status(400).json({
                message: "songLink must be a valid http or https URL"
            });
        }
        
        const userId = req.session.userId
        const newMood = {
            userId,
            clientId: cleanedClientId,
            mood: cleanedMood,
            intensity: cleanedIntensity,
            songTitle: cleanedSongTitle,
            artist: cleanedArtist,
            songLink: cleanedSongLink,
            note: cleanedNote,
            createdAt: new Date()
        };

        const savedMood = await createMoodModel(newMood);

        res.status(201).json({
            message: "Mood entry created",
            data: savedMood
        });

        

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }

};

const getMoods = async (req, res) => {

    try {
        const usersId = req.session.userId

        const moods = await getMoodsModel(usersId);

        res.status(200).json(moods);

    } catch (error) {

        res.status(500).json({
            message: error.message
        });

    }

};

export {
    createMood,
    getMoods
};

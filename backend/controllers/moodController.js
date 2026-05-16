import {
    createMoodModel,
    getMoodsModel
} from "../models/moodModel.js";

const createMood = async (req, res) => {

    try {

        const { mood, songTitle, artist, songLink, songUrl, intensity, note } = req.body;

        if (!mood || !songTitle) {
            return res.status(400).json({
                message: "mood and songTitle are required"
            });
        }

        
        const userId = req.session.userId
        const newMood = {
            userId,
            mood,
            intensity,
            songTitle,
            artist,
            songLink: songLink || songUrl || "",
            note,
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

import { connectDB } from "../connection/connection.js";

const createMoodModel = async (moodData) => {

    const db = await connectDB();

    const result = await db
        .collection("moods")
        .insertOne(moodData);

    return {
        _id: result.insertedId,
        ...moodData
    };

};

const getMoodsModel = async (usersId) => {


    const db = await connectDB();

    const moods = await db
        .collection("moods")
        .find({userId:usersId})
        .sort({ createdAt: -1 })
        .toArray();

    return moods;

};

export {
    createMoodModel,
    getMoodsModel
};
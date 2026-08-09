import express from "express";
import { isAuth } from "../middleware/auth.js";
import { createMood, getMoods } from "../controllers/moodController.js";

const router = express.Router();

router.post("/moods", isAuth, createMood);

router.get("/moods", isAuth, getMoods);

export default router;

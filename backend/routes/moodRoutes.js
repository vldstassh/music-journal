import express from "express";
import { isAuth } from "../middleware/auth.js";

const router = express.Router();

import { createMood, getMoods } from "../controllers/moodController.js";

router.post("/moods", isAuth, createMood);

router.get("/moods", isAuth, getMoods);

export default router;

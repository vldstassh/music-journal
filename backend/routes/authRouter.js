import express from "express";
import {
	signupUserController,
	loginUserController,
	logoutUserController,
	getCurrentUserController,
} from "../controllers/authController.js";
import { isAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", signupUserController);

router.post("/login", loginUserController);

router.post("/logout", logoutUserController);

router.get("/user", isAuth, getCurrentUserController);

export default router;

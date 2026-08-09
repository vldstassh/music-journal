import express from "express";
import { createConfiguredApp } from "./backend/runtime.js";

// Vercel loads this module once per function instance and reuses the exported app
// while the instance remains warm. The entry point deliberately does not listen on
// a port or install process signal handlers.
const { app } = await createConfiguredApp({ application: express() });

export default app;

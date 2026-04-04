import { Router } from "express";
import { authMiddleware } from "../middlewares/error.middlewares.js";
import { sessionController } from "../controllers/session.controller.js";

const sessionRoutes: Router = Router();

sessionRoutes.get("/session/:id", authMiddleware, sessionController.getSession);
sessionRoutes.get("/session/:id/checkpoint", authMiddleware, sessionController.getCheckpoint);
sessionRoutes.delete("/session/:id/checkpoint", authMiddleware, sessionController.clearCheckpoint);

export default sessionRoutes;

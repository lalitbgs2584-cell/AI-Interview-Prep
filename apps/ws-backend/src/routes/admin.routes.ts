import { Router } from "express";
import { adminController } from "../controllers/admin.controller.js";
import { adminMiddleware } from "../middlewares/error.middlewares.js";

const router: Router = Router();

router.get("/stats", adminMiddleware, adminController.getStats);
router.get("/analytics", adminMiddleware, adminController.getAnalytics);
router.get("/ai-monitor", adminMiddleware, adminController.getAiMonitor);
router.get("/settings", adminMiddleware, adminController.getSettings);
router.patch("/settings", adminMiddleware, adminController.updateSettings);
router.get("/users", adminMiddleware, adminController.getUsers);
router.get("/users/:id", adminMiddleware, adminController.getUserById);
router.patch("/users/:id", adminMiddleware, adminController.updateUser);
router.get("/interviews", adminMiddleware, adminController.getInterviews);
router.get("/interviews/:id", adminMiddleware, adminController.getInterviewById);
router.get("/recordings", adminMiddleware, adminController.listRecordings);
router.get("/recordings/:name", adminMiddleware, adminController.streamRecording);

export default router;

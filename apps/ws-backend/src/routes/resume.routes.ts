import { Router } from "express";

import { resumeController } from "../controllers/resume.controllers.js";
import { authMiddleware } from "../middlewares/error.middlewares.js";


const router: Router = Router();

router.post("/process-resume",authMiddleware, resumeController.processResume);
// router.use("/interview", interviewRoutes);

export default router;
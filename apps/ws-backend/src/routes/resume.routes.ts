import { Router } from "express";

import { resumeController } from "../controllers/resume.controllers.js";


const router: Router = Router();

router.post("/process-resume", resumeController.processResume);
// router.use("/interview", interviewRoutes);

export default router;
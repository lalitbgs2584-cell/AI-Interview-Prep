import { Router } from "express";
import { resumeController } from "../controllers/resume.controllers.js";
import { authMiddleware } from "../middlewares/error.middlewares.js";

const router: Router = Router();

router.post("/process-resume",          authMiddleware, resumeController.processResume);
router.post("/start-interview",         authMiddleware, resumeController.startInterview);

// ⚠️  /interview/history MUST be registered BEFORE /interview/:id/results
//     so Express doesn't treat "history" as the :id param.
router.get("/interview/history",        authMiddleware, resumeController.interviewHistory);

router.get("/interview/:id/results",    authMiddleware, resumeController.interviewFeedback);
router.post("/interview/:id/complete",  authMiddleware, resumeController.storeNeon);
router.get("/get-resume",               authMiddleware, resumeController.getResumeStatus);
router.get("/skills-insights",          authMiddleware, resumeController.getSkillsInsights);
router.post("/generate-plan",           authMiddleware, resumeController.generateInterviewPlan);

export default router;
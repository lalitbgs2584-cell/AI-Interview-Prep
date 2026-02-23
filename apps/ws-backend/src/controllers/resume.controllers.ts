import { Request, Response } from "express";
import { getUserIdFromRequest } from "../utils/authentication.utils.js";
import { redisClient } from "../config/redis.config.js";

export const resumeController = {
  processResume: async (req: Request, res: Response) => {
    try {
      const userId = await getUserIdFromRequest(req);
      const { fileId } = req.body;  // Fixed: req.body is object, not function; add type safety

      if (!userId || !fileId) {
        return res.status(400).json({ message: "Missing userId or fileId" });
      }

      const job = {
        type: "PROCESS_RESUME",
        fileId,
        userId
      };

      //  Queue job (add await if needed)
      await redisClient.lpush('process_resume', JSON.stringify(job));  
      await redisClient.quit();  // Close connection

      return res.status(200).json({ message: "Job queued successfully", userId });
    } catch (error) {
      console.error("Error processing resume:", error);
      return res.status(500).json({ message: "Failed to process resume" });
    }
  },
  uploadResume: async (req: Request, res: Response) => {
    try {
      const userId = await getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // TODO: upload logic

      return res.status(200).json({ message: "Resume uploaded" });
    } catch (error) {
      console.error("Error uploading resume:", error);
      return res.status(500).json({ message: "Failed to upload resume" });
    }
  },

  deleteResume: async (req: Request, res: Response) => {
    try {
      const userId = await getUserIdFromRequest(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // TODO: delete logic

      return res.status(200).json({ message: "Resume deleted" });
    } catch (error) {
      console.error("Error deleting resume:", error);
      return res.status(500).json({ message: "Failed to delete resume" });
    }
  },
};
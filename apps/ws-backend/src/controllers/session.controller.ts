import { Response } from "express";
import { prisma } from "@repo/db/prisma-db";
import { AuthenticatedRequest } from "../types/auth-request.js";
import { clearCheckpoint, readCheckpoint } from "../utils/checkpoint.js";

async function requireOwnedInterview(
  req: AuthenticatedRequest,
  res: Response,
  interviewId: string,
): Promise<{ id: string; userId: string; status: string; endReason: string | null } | null> {
  const userId = req.session?.user?.id;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId },
    select: {
      id: true,
      userId: true,
      status: true,
      endReason: true,
    },
  });

  if (!interview) {
    res.status(404).json({ message: "Interview session not found" });
    return null;
  }

  return interview;
}

export const sessionController = {
  getSession: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!interviewId) return res.status(400).json({ message: "Interview ID is required" });

    const interview = await requireOwnedInterview(req, res, interviewId);
    if (!interview) return;

    const checkpoint = await readCheckpoint(interviewId);

    return res.status(200).json({
      interviewId: interview.id,
      status: interview.status,
      endReason: interview.endReason,
      hasCheckpoint: Boolean(checkpoint),
      checkpointUpdatedAt: checkpoint?.updatedAt ?? null,
    });
  },

  getCheckpoint: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!interviewId) return res.status(400).json({ message: "Interview ID is required" });

    const interview = await requireOwnedInterview(req, res, interviewId);
    if (!interview) return;

    const checkpoint = await readCheckpoint(interviewId);
    if (!checkpoint) {
      return res.status(404).json({ message: "Checkpoint not found" });
    }

    return res.status(200).json({
      interviewId: interview.id,
      checkpoint,
    });
  },

  clearCheckpoint: async (req: AuthenticatedRequest, res: Response) => {
    const interviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!interviewId) return res.status(400).json({ message: "Interview ID is required" });

    const interview = await requireOwnedInterview(req, res, interviewId);
    if (!interview) return;

    await clearCheckpoint(interviewId);
    return res.status(204).send();
  },
};

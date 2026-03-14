// Load env FIRST
import dotenv from "dotenv";
dotenv.config({ override: true });

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import http from "http";
import routes from "./routes/resume.routes.js";
import { errorMiddleware } from "./middlewares/error.middlewares.js";
import { auth } from "@repo/auth/server";
import { toNodeHandler } from "better-auth/node";
import { prisma } from "@repo/db/prisma-db";
import "./workers/processResume.workers.js";
import "./workers/interviewCreation.workers.js";

import { redisClient } from "./config/redis.config.js";

const app: express.Application = express();
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

/* ---------------------------
   Global Middlewares
--------------------------- */
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all("/api/auth/*splat", toNodeHandler(auth));

/* ---------------------------
   Health Check
--------------------------- */
app.get("/health", async (_req, res) => {
  try {
    const users = await prisma.user.findFirst();
    res.status(200).json({
      status: "OK",
      users,
      timestamp: new Date().toISOString(),
      dbConnected: true,
    });
  } catch (error: any) {
    console.error("Health check DB error:", error);
    res.status(500).json({
      status: "ERROR",
      error: "DB connection failed",
      details: error.message,
    });
  }
});

/* ---------------------------
   API Routes
--------------------------- */
app.use("/api", routes);

/* ---------------------------
   WebSocket
--------------------------- */
io.on("connection", (socket) => {
  console.log("✅ WebSocket client connected:", socket.id);

  socket.on("resume_uploaded", (data) => {
    console.log("Resume uploaded:", data);
    socket.emit("resume_processed", { status: "success" });
  });

  // Join room + replay cached question if already generated
  socket.on("join_interview", async ({ interviewId }: { interviewId: string }) => {
    socket.join(`interview:${interviewId}`);
    console.log(`[join_interview] Socket ${socket.id} joined room interview:${interviewId}`);

    try {
      const cached = await redisClient.get(`interview:${interviewId}:current_question`);
      if (cached) {
        console.log(`[join_interview] Replaying cached question for ${interviewId}`);
        socket.emit("interview:question", JSON.parse(cached));
      }
    } catch (err) {
      console.error(`[join_interview] Failed to replay cached question:`, err);
    }
  });

  socket.on("submit_answer", async ({ interviewId, answer }) => {
    await redisClient.set(`interview:${interviewId}:latest_answer`, answer, "EX", 300);

    // Signal the Python node that an answer is ready
    await redisClient.publish(`interview:${interviewId}:answer_ready`, "1");
  });

  socket.on("interview:end", async ({ interviewId }) => {
    await redisClient.set(
      `interview:${interviewId}:ended`,
      "1",
      "EX",
      3600
    );
    await redisClient.set(
      `interview:${interviewId}:latest_answer`,
      "__END__"
    );
    await redisClient.publish(
      `interview:${interviewId}:answer_ready`,
      "1"
    );
  });

  socket.on("disconnect", () => {
    console.log("❌ WebSocket client disconnected:", socket.id);
  });
});

app.set("io", io);

/* ---------------------------
   Error Handler (LAST)
--------------------------- */
app.use(errorMiddleware);

/* ---------------------------
   Start Server
--------------------------- */
const PORT = 4000;

server.listen(PORT, () => {
  console.log(`✅ ws-backend + WebSocket running on port ${PORT}`);
  console.log(`✅ DATABASE_URL loaded:`, !!process.env.DATABASE_URL ? "✅" : "❌");
  console.log(`✅ Environment: ${process.env.NODE_ENV || "development"}`);
});
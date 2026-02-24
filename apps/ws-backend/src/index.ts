// apps/ws-backend/src/index.ts (COMPLETE & FINAL)
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import http from "http";
import dotenv from "dotenv";
import routes from "./routes/resume.routes.js";
import { errorMiddleware } from "./middlewares/error.middlewares.js";
import { auth } from "@repo/auth/server";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { prisma } from "@repo/db/prisma-db";

// Load env FIRST
dotenv.config({ override: true });

const app: express.Application = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true
  }
});

/* ---------------------------
   Global Middlewares FIRST
--------------------------- */
app.use(cookieParser());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Express 5 wildcard syntax
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
      dbConnected: true
    });
  } catch (error: any) {
    console.error("Health check DB error:", error);
    res.status(500).json({
      status: "ERROR",
      error: "DB connection failed",
      details: error.message
    });
  }
});

app.get("/api/me", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return res.json(session);
  } catch (error) {
    return res.status(401).json({ error: "No session" });
  }
});

/* ---------------------------
   Other API Routes
--------------------------- */
app.use("/api", routes);

/* ---------------------------
   WebSocket Setup
--------------------------- */
io.on("connection", (socket) => {
  console.log("✅ WebSocket client connected:", socket.id);

  socket.on("resume_uploaded", (data) => {
    console.log("Resume uploaded:", data);
    socket.emit("resume_processed", { status: "success" });
  });

  socket.on("disconnect", () => {
    console.log("❌ WebSocket client disconnected:", socket.id);
  });
});

// Attach io to app for route access
app.set("io", io);

/* ---------------------------
   Error Handler (LAST)
--------------------------- */
app.use(errorMiddleware);

/* ---------------------------
   START SERVER ON PORT 4000
--------------------------- */
const PORT = 4000;  // Fixed port


// Port free, start server
server.listen(PORT, () => {
  console.log(`✅ ws-backend + WebSocket running on port ${PORT}`);
  console.log(`✅ DATABASE_URL loaded:`, !!process.env.DATABASE_URL ? "✅" : "❌");
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
});


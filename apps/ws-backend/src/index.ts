import express from "express";
import cors from "cors";
import routes from "./routes/resume.routes.js";
import { errorMiddleware } from "./middlewares/error.middlewares.js";
import dotenv from "dotenv"
dotenv.config()
const app: express.Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "http://localhost:3000", // frontend URL
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

/* ---------------------------
   Health Check Route
---------------------------- */

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "OK" });
});

/* ---------------------------
   API Routes
---------------------------- */

app.use("/api", routes);

/* ---------------------------
   Error Handling (Always Last)
---------------------------- */

app.use(errorMiddleware);

export default app;
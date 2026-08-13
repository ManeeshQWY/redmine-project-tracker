import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { issuesRouter } from "./routes/issues";
import { metaRouter } from "./routes/meta";
import { requireSession } from "./middleware/requireSession";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// In dev the frontend runs on a different origin (5173) than the backend (4000), so CORS
// needs an explicit origin + credentials:true for the session cookie to be sent/stored.
// In production the backend serves the built frontend itself (see static block below),
// so requests are same-origin and this CORS config is simply unused.
app.use(
  cors({
    origin: config.isProduction ? true : "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.path}`);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/projects", requireSession, projectsRouter);
app.use("/api/projects", requireSession, issuesRouter);
app.use("/api/meta", requireSession, metaRouter);

// Single-process deployment: serve the built frontend (frontend/npm run build → dist/)
// as static files, with an SPA fallback so client-side routing still works. Lets the
// whole app run as one process on a single free-tier host.
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Redmine Tracker backend listening on http://localhost:${config.port}`);
  console.log(`Proxying Redmine at ${config.redmineBaseUrl} — each user authenticates with their own API key (never logged)`);
});

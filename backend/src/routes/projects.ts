import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loadProjects } from "../services/dataStore";

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { apiKey } = req.session!;
    const projects = await loadProjects(apiKey);
    res.json({ projects });
  })
);

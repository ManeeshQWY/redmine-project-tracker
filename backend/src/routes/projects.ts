import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loadProjects } from "../services/dataStore";

export const projectsRouter = Router();

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { apiKey, user } = req.session!;
    const projects = await loadProjects(user.id, apiKey);
    res.json({ projects });
  })
);

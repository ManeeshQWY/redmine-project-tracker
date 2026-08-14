import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loadProjectIssues } from "../services/dataStore";

export const issuesRouter = Router();

issuesRouter.get(
  "/:projectIdentifier/issues",
  asyncHandler(async (req, res) => {
    const { projectIdentifier } = req.params;
    const forceRefresh = req.query.refresh === "true";
    const { apiKey } = req.session!;
    const result = await loadProjectIssues(apiKey, projectIdentifier, forceRefresh);
    res.json(result);
  })
);

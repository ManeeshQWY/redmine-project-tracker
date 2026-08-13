import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loadMeta } from "../services/dataStore";

export const metaRouter = Router();

metaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { apiKey, user } = req.session!;
    const meta = await loadMeta(user.id, apiKey);
    res.json(meta);
  })
);

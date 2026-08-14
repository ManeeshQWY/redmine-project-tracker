import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loadMeta } from "../services/dataStore";

export const metaRouter = Router();

metaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { apiKey } = req.session!;
    const meta = await loadMeta(apiKey);
    res.json(meta);
  })
);

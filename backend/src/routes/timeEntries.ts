import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { loadTimeEntries } from "../services/dataStore";

export const timeEntriesRouter = Router();

// projectIdentifier may be the special value "__all__" (ALL_PROJECTS) — this is a
// deliberately explicit, on-demand endpoint (not auto-fetched with issues) since time
// entry volume can be very large (tens of thousands across the whole instance).
timeEntriesRouter.get(
  "/:projectIdentifier/time-entries",
  asyncHandler(async (req, res) => {
    const { projectIdentifier } = req.params;
    const forceRefresh = req.query.refresh === "true";
    const { apiKey } = req.session!;
    const result = await loadTimeEntries(apiKey, projectIdentifier, forceRefresh);
    res.json(result);
  })
);

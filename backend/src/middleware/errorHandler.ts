import { NextFunction, Request, Response } from "express";
import { RedmineApiError } from "../services/redmineClient";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof RedmineApiError) {
    console.error(`[error] RedmineApiError (status=${err.status}): ${err.message}`);
    const httpStatus = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(httpStatus).json({ error: err.userMessage });
    return;
  }

  console.error("[error] Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred. Please try again or contact the administrator." });
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

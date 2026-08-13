import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { getSession, Session } from "../services/sessionStore";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[config.sessionCookieName];
  const session = getSession(sessionId);
  if (!session) {
    res.status(401).json({ error: "Please log in with your Redmine API key." });
    return;
  }
  req.session = session;
  next();
}

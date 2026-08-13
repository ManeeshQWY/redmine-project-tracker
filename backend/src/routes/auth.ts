import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireSession } from "../middleware/requireSession";
import { resolveCurrentUser } from "../services/redmineService";
import { createSession, destroySession } from "../services/sessionStore";
import { config } from "../config";

export const authRouter = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.isProduction,
  maxAge: config.sessionTtlMs,
};

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey) {
      res.status(400).json({ error: "Please enter your Redmine API key." });
      return;
    }

    const user = await resolveCurrentUser(apiKey);
    const sessionId = createSession(apiKey, user);
    res.cookie(config.sessionCookieName, sessionId, cookieOptions);
    res.json({ user: { name: user.name, login: user.login, mail: user.mail } });
  })
);

authRouter.post("/logout", (req, res) => {
  destroySession(req.cookies?.[config.sessionCookieName]);
  res.clearCookie(config.sessionCookieName, { httpOnly: true, sameSite: "lax", secure: config.isProduction });
  res.json({ ok: true });
});

authRouter.get("/me", requireSession, (req, res) => {
  const { name, login, mail } = req.session!.user;
  res.json({ user: { name, login, mail } });
});

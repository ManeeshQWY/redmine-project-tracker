import crypto from "crypto";
import { TtlCache } from "./cache";
import { config } from "../config";
import { CurrentRedmineUser } from "./redmineService";

export interface Session {
  apiKey: string;
  user: CurrentRedmineUser;
}

// In-memory only — sessions do not survive a backend restart, same tradeoff as the
// issue cache. Each teammate's raw API key lives only here, keyed by an opaque random
// session id; it is never sent back to the browser after login.
const sessions = new TtlCache<Session>(config.sessionTtlMs);

export function createSession(apiKey: string, user: CurrentRedmineUser): string {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { apiKey, user });
  return sessionId;
}

export function getSession(sessionId: string | undefined): Session | undefined {
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
}

export function destroySession(sessionId: string | undefined): void {
  if (sessionId) sessions.invalidate(sessionId);
}

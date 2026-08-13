import { describe, it, expect } from "vitest";

process.env.REDMINE_BASE_URL = "https://redmine.test";

import { createSession, getSession, destroySession } from "../src/services/sessionStore";
import { CurrentRedmineUser } from "../src/services/redmineService";

const testUser: CurrentRedmineUser = { id: 1, name: "Jane Doe", login: "jane", mail: "jane@example.com" };

describe("sessionStore", () => {
  it("creates a session that can be retrieved by its id, holding the caller's own api key", () => {
    const sessionId = createSession("secret-key", testUser);
    const session = getSession(sessionId);
    expect(session).toBeDefined();
    expect(session!.apiKey).toBe("secret-key");
    expect(session!.user).toEqual(testUser);
  });

  it("returns undefined for an unknown session id", () => {
    expect(getSession("does-not-exist")).toBeUndefined();
  });

  it("returns undefined when no session id is provided", () => {
    expect(getSession(undefined)).toBeUndefined();
  });

  it("invalidates a session on destroy so it can no longer be retrieved", () => {
    const sessionId = createSession("secret-key", testUser);
    expect(getSession(sessionId)).toBeDefined();
    destroySession(sessionId);
    expect(getSession(sessionId)).toBeUndefined();
  });

  it("keeps different sessions independent, even for the same user", () => {
    const a = createSession("key-a", testUser);
    const b = createSession("key-b", { ...testUser, id: 2 });
    expect(getSession(a)!.apiKey).toBe("key-a");
    expect(getSession(b)!.apiKey).toBe("key-b");
    destroySession(a);
    expect(getSession(a)).toBeUndefined();
    expect(getSession(b)).toBeDefined();
  });
});

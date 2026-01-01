import { randomBytes } from "crypto";

export type SessionData = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  obtained_at?: number;
};

// In-memory session store (for development)
// In production, use Redis or a database
const sessions = new Map<string, SessionData>();

export function createSession(tokens: SessionData): string {
  const sessionId = randomBytes(32).toString("base64url");
  sessions.set(sessionId, tokens);
  return sessionId;
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}

export function updateSession(sessionId: string, tokens: SessionData): void {
  sessions.set(sessionId, tokens);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

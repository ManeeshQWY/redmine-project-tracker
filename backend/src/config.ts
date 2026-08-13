import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  redmineBaseUrl: required("REDMINE_BASE_URL").replace(/\/+$/, ""),
  port: Number(process.env.PORT) || 4000,
  sessionCookieName: "rtt_sid",
  sessionTtlMs: 12 * 60 * 60 * 1000, // 12 hours
  isProduction: process.env.NODE_ENV === "production",
};

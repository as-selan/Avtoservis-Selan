import type { NextConfig } from "next";

const previewHost = process.env.VERCEL_URL ?? "";
const workshopPreview = process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "codex/selan-pr18-manual-qa" &&
  /^[a-z0-9-]+\.vercel\.app$/.test(previewHost);
const quibiDevRead = workshopPreview && process.env.QUIBI_MODE === "dev";

const nextConfig: NextConfig = {
  ...(process.env.SELAN_LOCAL_REVIEW === "1" ? { distDir: ".next-local-review" } : {}),
  // Only this reviewed branch can opt into Quibi DEV reads on the hosted project.
  // Credentials remain server-only; without an explicit DEV mode this stays a demo.
  ...(workshopPreview ? { env: {
    APP_ENV: "preproduction",
    QUIBI_MODE: quibiDevRead ? "dev" : "demo",
    SELAN_REMOTE_DEMO: quibiDevRead ? "0" : "1",
    NEXT_PUBLIC_SELAN_REMOTE_DEMO: quibiDevRead ? "0" : "1",
    SELAN_FIXED_PRICE_V1: "1",
    PUBLIC_APP_ORIGIN: `https://${previewHost}`,
    COMPLETION_PUBLIC_ORIGIN: `https://${previewHost}`,
  } } : {}),
};

export default nextConfig;

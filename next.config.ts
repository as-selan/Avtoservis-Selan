import type { NextConfig } from "next";

const previewHost = process.env.VERCEL_URL ?? "";
const workshopPreview = process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "codex/selan-pr18-manual-qa" &&
  /^[a-z0-9-]+\.vercel\.app$/.test(previewHost);
const branchHost = process.env.VERCEL_BRANCH_URL ?? "";
const publicPreviewHost = /^[a-z0-9-]+\.vercel\.app$/.test(branchHost) ? branchHost : previewHost;

const nextConfig: NextConfig = {
  ...(process.env.SELAN_LOCAL_REVIEW === "1" ? {
    distDir: ".next-local-review",
    env: { NEXT_PUBLIC_SELAN_LOCAL_REVIEW: "1" },
  } : {}),
  // Only this reviewed branch can opt into Quibi DEV reads on the hosted project.
  // Credentials remain server-only. A reviewed Preview never silently falls back to demo data.
  ...(workshopPreview ? { env: {
    APP_ENV: "preproduction",
    QUIBI_MODE: process.env.QUIBI_MODE ?? "",
    SELAN_REMOTE_DEMO: "0",
    NEXT_PUBLIC_SELAN_REMOTE_DEMO: "0",
    SELAN_FIXED_PRICE_V1: "1",
    PUBLIC_APP_ORIGIN: `https://${publicPreviewHost}`,
    COMPLETION_PUBLIC_ORIGIN: `https://${publicPreviewHost}`,
  } } : {}),
};

export default nextConfig;

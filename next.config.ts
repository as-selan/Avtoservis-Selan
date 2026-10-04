import type { NextConfig } from "next";

const previewHost = process.env.VERCEL_URL ?? "";
const workshopPreview = process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "codex/selan-pr18-manual-qa" &&
  /^[a-z0-9-]+\.vercel\.app$/.test(previewHost);

const nextConfig: NextConfig = {
  ...(process.env.SELAN_LOCAL_REVIEW === "1" ? { distDir: ".next-local-review" } : {}),
  // Only this reviewed branch gets synthetic Quibi reads on the existing hosted project.
  // These are public mode flags and origins; Supabase secrets stay in Vercel settings.
  ...(workshopPreview ? { env: {
    APP_ENV: "preproduction",
    QUIBI_MODE: "demo",
    SELAN_REMOTE_DEMO: "1",
    NEXT_PUBLIC_SELAN_REMOTE_DEMO: "1",
    SELAN_FIXED_PRICE_V1: "1",
    PUBLIC_APP_ORIGIN: `https://${previewHost}`,
    COMPLETION_PUBLIC_ORIGIN: `https://${previewHost}`,
  } } : {}),
};

export default nextConfig;

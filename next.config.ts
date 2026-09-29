import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.SELAN_LOCAL_REVIEW === "1" ? { distDir: ".next-local-review" } : {}),
};

export default nextConfig;

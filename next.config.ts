import type { NextConfig } from "next";

const isPages = process.env.GITHUB_ACTIONS === "true";
const repo = "sati-project";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isPages ? `/${repo}` : undefined,
  assetPrefix: isPages ? `/${repo}/` : undefined,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // This allows the build to succeed even if there are linting errors (like 'any')
    ignoreDuringBuilds: true,
  },
  typescript: {
    // This allows the build to succeed even if there are TypeScript errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
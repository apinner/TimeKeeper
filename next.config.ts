import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // nodemailer and the Prisma adapter use Node built-ins; leave them to Node
  // rather than bundling them.
  serverExternalPackages: ["nodemailer", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;

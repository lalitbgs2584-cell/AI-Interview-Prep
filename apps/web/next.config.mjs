/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui", "@repo/auth", "@repo/db"],
  output: "standalone",
  serverExternalPackages: ["@prisma/client","@prisma/adapter-pg"]
};

export default nextConfig;
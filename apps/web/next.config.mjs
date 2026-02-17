/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui", "@repo/auth", "@repo/db"],
  output: "standalone",
};

export default nextConfig;
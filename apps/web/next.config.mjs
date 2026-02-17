/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
  output:"standalone",
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"]
}

export default nextConfig;
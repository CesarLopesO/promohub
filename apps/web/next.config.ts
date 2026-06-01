import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@promohub/ui", "@promohub/shared", "@promohub/types"],
};

export default nextConfig;

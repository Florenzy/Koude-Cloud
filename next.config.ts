import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  distDir: process.env.KOUDE_RUNTIME === "node" ? ".next-node" : undefined,
  output: process.env.KOUDE_RUNTIME === "node" ? "standalone" : undefined,
  serverExternalPackages: ["pg"],
  webpack(config) {
    config.resolve.alias["@runtime"] = path.resolve(
      process.cwd(),
      process.env.KOUDE_RUNTIME === "node"
        ? "lib/runtime-node.ts"
        : "lib/runtime-cloud.ts",
    );
    return config;
  },
  async headers() {
    if (process.env.KOUDE_RUNTIME !== "node") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;

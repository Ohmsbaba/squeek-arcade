import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A lockfile in the home folder would otherwise be picked up as the workspace root.
  outputFileTracingRoot: root,
  // The physics WASM runs on the server for the authoritative result. Don't bundle it there.
  serverExternalPackages: ["@dimforge/rapier2d-deterministic-compat", "@prisma/client"],
  transpilePackages: ["three"],
  images: { unoptimized: true },
  // Read at runtime, so the tracer can't see them on its own.
  outputFileTracingIncludes: {
    "/r/[id]/opengraph-image": ["./node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff"],
    "/p/[id]/opengraph-image": ["./node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff"],
  },
  webpack: (config) => {
    // wagmi's optional connectors reach for these node-only packages.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.fallback = { ...config.resolve.fallback, "@react-native-async-storage/async-storage": false };
    config.resolve.alias["wagmi-walletconnect"] = join(root, "node_modules/@wagmi/connectors/dist/esm/walletConnect.js");
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;

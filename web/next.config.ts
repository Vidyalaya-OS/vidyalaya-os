import type { NextConfig } from "next";

// In development the web app forwards /api to the Django API, so the browser
// talks to one origin. In production set API_URL to the API's address.
// It is read when the app is built, so change it with a new deploy.
const apiUrl = process.env.API_URL?.replace(/\/+$/, "") ?? "http://localhost:8000";
if (process.env.VERCEL && !process.env.API_URL) {
  throw new Error("Set API_URL to the API's address (for example https://vidyalaya-api.onrender.com) in the Vercel project settings.");
}

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

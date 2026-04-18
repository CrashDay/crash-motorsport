/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingExcludes: {
    "/api/sync/local-exports": [
      "./public/photos/**/*",
      "./public/branding/**/*",
      "./app/audio/**/*",
    ],
    "/maps/[trackId]": [
      "./public/photos/**/*",
      "./public/branding/**/*",
      "./app/audio/**/*",
      "./data/*.db*",
      "./node_modules/better-sqlite3/**/*",
    ],
    "/api/admin/maps": [
      "./public/photos/**/*",
      "./public/branding/**/*",
      "./app/audio/**/*",
      "./data/*.db*",
      "./node_modules/better-sqlite3/**/*",
    ],
  },
};

export default nextConfig;

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
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingExcludes: {
    "/*": [
      "./public/photos/**/*",
      "./public/branding/**/*",
      "./app/audio/**/*",
    ],
  },
};

export default nextConfig;

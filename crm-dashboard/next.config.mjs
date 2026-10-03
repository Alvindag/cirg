const dasApi = process.env.DAS_API_BASE_URL?.replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_DAS_BUILTIN: dasApi ? "" : "true" },
  // With DAS_API_BASE_URL set, send /das-api/* to that server (no CORS change needed).
  // beforeFiles so it wins over the built-in handler in app/das-api. Without it,
  // the built-in backend answers.
  async rewrites() {
    return dasApi
      ? {
          beforeFiles: [
            { source: "/das-api/:path*", destination: `${dasApi}/:path*` },
          ],
        }
      : [];
  },
};

export default nextConfig;

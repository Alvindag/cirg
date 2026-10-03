const dasApi = process.env.DAS_API_BASE_URL?.replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_DAS_ENABLED: dasApi ? "true" : "" },
  // Proxy the DAS Engage 360 API through this origin so the API needs no CORS change.
  async rewrites() {
    return dasApi
      ? [{ source: "/das-api/:path*", destination: `${dasApi}/:path*` }]
      : [];
  },
};

export default nextConfig;

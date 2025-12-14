/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    // BACKEND_ORIGIN is where the Fastify API is actually listening
    // Default to local API on port 4000 if not set.
    const normalizeOrigin = (input) => {
      const raw = (input && input.trim()) || "http://127.0.0.1:4000";
      return raw.endsWith("/") ? raw.slice(0, -1) : raw;
    };

    const BACKEND_ORIGIN = normalizeOrigin(process.env.BACKEND_ORIGIN);

    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_ORIGIN}/:path*`
      }
    ];
  }
};

export default nextConfig;

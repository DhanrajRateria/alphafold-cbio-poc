/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // NGL uses browser-only APIs; exclude it from the server bundle
    if (isServer) {
      config.externals = [...(config.externals || []), 'ngl'];
    }
    return config;
  },
};

module.exports = nextConfig;
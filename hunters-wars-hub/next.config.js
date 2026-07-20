/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "swarfarm.com" }],
  },
};
module.exports = nextConfig;

** @type {import('next').NextConfig} */
const nextConfig = {
    // This setting is required for @xenova/transformers to work on Vercel
    serverExternalPackages: ['@xenova/transformers'],
};

export default nextConfig;
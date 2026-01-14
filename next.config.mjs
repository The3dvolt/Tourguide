/** @type {import('next').NextConfig} */
const nextConfig = {
    // This prevents webpack from bundling the library, allowing it to load binaries correctly
    serverExternalPackages: ['@xenova/transformers', 'wavefile'],
};

export default nextConfig;
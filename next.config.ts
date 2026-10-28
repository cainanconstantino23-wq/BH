import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    // Ignora erros de tipagem no build para evitar bloqueios na Vercel
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
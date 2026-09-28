import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Fully static site (HTML/CSS/JS in `out/`), served by Cloudflare Workers
  // Static Assets — see wrangler.jsonc. No Node.js server at runtime.
  output: 'export',
  experimental: {
    // One styled 404 for every unmatched URL. Needed because the app has two
    // root layouts (`/` and `/[lang]`), so there's no single layout to wrap it.
    globalNotFound: true,
  },
};

export default nextConfig;

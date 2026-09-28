// wrangler bundles `.sql` files as text modules (its default module rules).
declare module '*.sql' {
  const sql: string;
  export default sql;
}

// src/config/site.ts reads a Next.js build-time variable; wrangler.jsonc `define`
// replaces this exact expression with `undefined` when bundling the Worker.
declare const process: { env: { NEXT_PUBLIC_SITE_URL?: string } };

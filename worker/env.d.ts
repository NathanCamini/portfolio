// wrangler bundles `.sql` files as text modules (its default module rules).
declare module '*.sql' {
  const sql: string;
  export default sql;
}

// src/config/site.ts reads Next.js build-time variables; wrangler.jsonc `define`
// replaces these exact expressions with `undefined` when bundling the Worker.
declare const process: { env: { NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_GAME_URL?: string } };

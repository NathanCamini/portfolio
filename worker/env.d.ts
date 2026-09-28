// wrangler bundles `.sql` files as text modules (its default module rules).
declare module '*.sql' {
  const sql: string;
  export default sql;
}

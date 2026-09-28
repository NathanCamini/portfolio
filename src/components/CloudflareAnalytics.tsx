/**
 * Cloudflare Web Analytics beacon: page views, visitors, countries, referrers,
 * devices and Core Web Vitals — no cookies, no personal data, so no consent banner.
 *
 * Off unless the build has NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN (the token from
 * the "manual JS snippet" in the Cloudflare dashboard; it is public by design,
 * it ends up in the HTML either way). Local builds and forks send nothing.
 *
 * Deliberately not in src/config/site.ts: that file is also bundled into the
 * Worker, which has no `process`.
 */
const token = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN;

export function CloudflareAnalytics() {
  if (!token) return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}

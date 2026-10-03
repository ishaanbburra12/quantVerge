/**
 * The site's canonical base URL.
 *
 * Resolved in order of specificity so that no manual configuration is required
 * in the common case:
 *
 *   1. NEXT_PUBLIC_SITE_URL — set this only when the site has a custom domain,
 *      since nothing else can know about it.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — injected automatically by Vercel at build
 *      time and stable across deployments, so the production sitemap keeps
 *      pointing at the production domain even when a preview build generates it.
 *   3. VERCEL_URL — the per-deployment URL. A reasonable fallback for previews.
 *   4. localhost — development.
 *
 * The earlier placeholder was a real bug rather than a cosmetic one: a sitemap
 * advertising a domain that does not resolve sends crawlers to nothing at all.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    // Strip any trailing slash so callers can always concatenate paths safely.
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

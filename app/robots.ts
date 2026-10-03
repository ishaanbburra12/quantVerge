import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

const BASE_URL = getSiteUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}

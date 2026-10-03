import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";
import { LABS } from "@/content/labs";
import { LESSONS } from "@/content/lessons";
import { JOURNAL_POSTS } from "@/content/journal";
import { MODULES } from "@/content/lessons";

/**
 * The sitemap is generated from the same content registries the pages render
 * from, so a new lab or lesson appears here automatically. A hand-maintained
 * sitemap drifts out of date the first time someone forgets to update it.
 */
const BASE_URL = getSiteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes = [
    { path: "", priority: 1.0 },
    { path: "/labs", priority: 0.9 },
    { path: "/learn", priority: 0.9 },
    { path: "/research", priority: 0.8 },
    { path: "/research/rl-market-robustness", priority: 0.8 },
    { path: "/research/experiment-log", priority: 0.7 },
    { path: "/research/journal", priority: 0.7 },
    { path: "/projects", priority: 0.7 },
    { path: "/challenges", priority: 0.7 },
    { path: "/glossary", priority: 0.6 },
    { path: "/about", priority: 0.6 },
    { path: "/references", priority: 0.5 },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${BASE_URL}${route.path}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: route.priority,
    })),
    ...LABS.filter((lab) => lab.status === "available").map((lab) => ({
      url: `${BASE_URL}/labs/${lab.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...LESSONS.map((lesson) => ({
      url: `${BASE_URL}/learn/${lesson.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...MODULES.map((module) => ({
      url: `${BASE_URL}/learn/notes/${module.number}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...JOURNAL_POSTS.map((post) => ({
      url: `${BASE_URL}/research/journal/${post.slug}`,
      lastModified: new Date(post.date),
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}

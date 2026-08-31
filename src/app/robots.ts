import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/records", "/account/", "/attorney", "/auth/"],
    },
    sitemap: "https://custodyfolio.com/sitemap.xml",
  };
}

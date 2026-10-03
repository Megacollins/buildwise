import type { MetadataRoute } from "next";

/** Keep private app pages and auth flows out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api", "/reset-password", "/verify-email"] }],
    ...(process.env.APP_URL ? { host: process.env.APP_URL } : {}),
  };
}

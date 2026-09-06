import { siteConfig } from "../config/site.js";
import { getSiteUrl } from "../utils/seo.js";

export function GET() {
    const siteUrl = getSiteUrl();
    const lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /giris/",
        "Disallow: /kayit/",
        "Disallow: /hesabim/",
        "Disallow: /favorilerim/",
        "Disallow: /sifremi-unuttum/",
        "Disallow: /sifre-yenile/",
        "",
        siteUrl
            ? `Sitemap: ${siteUrl}/sitemap-index.xml`
            : `# Sitemap, ${siteConfig.siteName} için gerçek siteUrl tanımlandığında otomatik eklenir.`
    ];

    return new Response(`${lines.join("\n")}\n`, {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
}

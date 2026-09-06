import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { siteConfig } from "./src/config/site.js";

const siteUrl = String(siteConfig.siteUrl ?? "").trim();
const privateRoutes = [
    "/giris/",
    "/kayit/",
    "/hesabim/",
    "/favorilerim/",
    "/sifremi-unuttum/",
    "/sifre-yenile/",
    "/404/",
    "/astroloji/gunluk-burc-yorumlari/",
    "/robots.txt"
];

export default defineConfig({
    site: siteUrl || undefined,
    integrations: siteUrl
        ? [sitemap({
            filter: (page) => {
                const pathname = new URL(page).pathname;
                return pathname !== "/404.html"
                    && !privateRoutes.some((route) => pathname === route || pathname.startsWith(route));
            }
        })]
        : [],
    redirects: {
        "/astroloji/gunluk-burc-yorumlari": "/astroloji/burclar/"
    }
});

import { siteConfig } from "../config/site.js";

const absoluteUrlPattern = /^https?:\/\//i;

export function getSiteUrl() {
    return String(siteConfig.siteUrl ?? "").trim().replace(/\/+$/, "");
}

export function toAbsoluteUrl(value) {
    const input = String(value ?? "").trim();
    if (!input) return "";
    if (absoluteUrlPattern.test(input)) return input;

    const siteUrl = getSiteUrl();
    if (!siteUrl) return "";

    try {
        return new URL(input.startsWith("/") ? input : `/${input}`, `${siteUrl}/`).href;
    } catch {
        return "";
    }
}

export function createArticleStructuredData({ title, description, canonicalPath, image, publishedAt }) {
    return compactStructuredData({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        url: toAbsoluteUrl(canonicalPath),
        image: toAbsoluteUrl(image),
        datePublished: publishedAt || undefined
    });
}

export function createMediaStructuredData({ item, canonicalPath }) {
    return compactStructuredData({
        "@context": "https://schema.org",
        "@type": item.type === "series" ? "TVSeries" : "Movie",
        name: item.title,
        description: item.description,
        url: toAbsoluteUrl(canonicalPath),
        image: toAbsoluteUrl(item.image),
        genre: item.genre || undefined,
        dateCreated: item.year ? String(item.year) : undefined
    });
}

export function createWebSiteStructuredData() {
    const url = getSiteUrl();
    if (!url) return null;

    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteConfig.siteName,
        url
    };
}

function compactStructuredData(value) {
    return Object.fromEntries(
        Object.entries(value).filter(([, fieldValue]) => (
            fieldValue !== undefined && fieldValue !== null && fieldValue !== ""
        ))
    );
}

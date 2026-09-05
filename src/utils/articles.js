export const categoryLabels = {
    astroloji: "Astroloji",
    "yemek-tarifleri": "Yemek Tarifleri",
    "kultur-sanat": "Kültür & Sanat",
    "ruya-tabirleri": "Rüya Tabirleri",
    "kisisel-gelisim": "Kişisel Gelişim"
};

export function getArticleUrl(article) {
    return `/${article.category}/${article.slug}/`;
}

export function formatArticleDate(publishedAt) {
    const date = new Date(publishedAt);
    const datePart = new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Istanbul"
    }).format(date);
    const timePart = new Intl.DateTimeFormat("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Istanbul"
    }).format(date);

    return `${datePart} • ${timePart}`;
}

export function sortArticlesNewest(articles) {
    return [...articles].sort(
        (first, second) => new Date(second.publishedAt).getTime() - new Date(first.publishedAt).getTime()
    );
}

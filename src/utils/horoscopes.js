export function sortHoroscopesNewest(horoscopes) {
    return [...horoscopes].sort(
        (first, second) => new Date(second.publishedAt).getTime() - new Date(first.publishedAt).getTime()
    );
}

export function getLatestHoroscope(horoscopes) {
    return sortHoroscopesNewest(horoscopes)[0];
}

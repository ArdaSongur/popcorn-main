const turkishCharacters = {
    ç: "c",
    ğ: "g",
    ı: "i",
    ö: "o",
    ş: "s",
    ü: "u"
};

export function slugify(value) {
    return String(value)
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[çğıöşü]/g, (character) => turkishCharacters[character])
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

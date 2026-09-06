export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug, { contentType = "content", title = "Untitled" } = {}) {
    const value = typeof slug === "string" ? slug : "";

    if (!value || !slugPattern.test(value)) {
        const shownValue = value || String(slug ?? "");
        throw new Error(
            `Invalid slug "${shownValue}" for ${contentType} "${title}".\n`
            + "Slug must match: lowercase letters, numbers and hyphens only.\n"
            + "Slug cannot start or end with a hyphen, contain spaces, Turkish characters or consecutive hyphens."
        );
    }

    return value;
}

export function validateContentRoutes(records, {
    contentType,
    getRoute,
    getSlug = (record) => record.slug,
    getTitle = (record) => record.title
}) {
    const routes = new Map();

    records.forEach((record) => {
        const title = String(getTitle(record) ?? "Untitled");
        validateSlug(getSlug(record), { contentType, title });
        const route = getRoute(record);
        const existingTitle = routes.get(route);

        if (existingTitle) {
            throw new Error(
                `Duplicate route detected:\n${route}\n`
                + `Conflicting ${contentType} records: "${existingTitle}" and "${title}".`
            );
        }

        routes.set(route, title);
    });

    return records;
}

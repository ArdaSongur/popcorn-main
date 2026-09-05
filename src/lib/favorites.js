import { supabase } from "./supabase.js";

const favoriteSlugs = new Set();
const pendingSlugs = new Set();

const getButtons = (slug) => Array.from(
    document.querySelectorAll(`[data-favorite-button][data-media-slug="${CSS.escape(slug)}"]`)
);

const renderButton = (button, isFavorite) => {
    button.classList.toggle("is-favorite", isFavorite);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.textContent = isFavorite ? "❤️ Favoride" : "🤍 Favori";
};

const renderSlug = (slug, isFavorite) => {
    if (isFavorite) favoriteSlugs.add(slug);
    else favoriteSlugs.delete(slug);

    getButtons(slug).forEach((button) => renderButton(button, isFavorite));
};

const setSlugLoading = (slug, isLoading) => {
    getButtons(slug).forEach((button) => {
        button.disabled = isLoading;
        button.setAttribute("aria-busy", String(isLoading));
    });
};

export async function getFavoriteSlugs(userId, slugs) {
    let query = supabase
        .from("favorites")
        .select("media_slug")
        .eq("user_id", userId);

    if (slugs?.length) query = query.in("media_slug", slugs);

    const { data, error } = await query;
    if (error) throw error;

    return new Set((data ?? []).map((favorite) => favorite.media_slug));
}

async function syncFavoriteButtons(session) {
    const buttons = Array.from(document.querySelectorAll("[data-favorite-button][data-media-slug]"));
    const slugs = [...new Set(buttons.map((button) => button.dataset.mediaSlug).filter(Boolean))];

    favoriteSlugs.clear();

    if (!session?.user || slugs.length === 0) {
        buttons.forEach((button) => renderButton(button, false));
        return;
    }

    try {
        const storedSlugs = await getFavoriteSlugs(session.user.id, slugs);
        slugs.forEach((slug) => renderSlug(slug, storedSlugs.has(slug)));
    } catch (error) {
        console.error("Favoriler yüklenemedi:", error);
    }
}

async function toggleFavorite(button) {
    const slug = button.dataset.mediaSlug;
    if (!slug || pendingSlugs.has(slug)) return;

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
        window.location.assign("/giris/");
        return;
    }

    const wasFavorite = favoriteSlugs.has(slug);
    pendingSlugs.add(slug);
    setSlugLoading(slug, true);

    const query = wasFavorite
        ? supabase
            .from("favorites")
            .delete()
            .eq("user_id", session.user.id)
            .eq("media_slug", slug)
        : supabase
            .from("favorites")
            .insert({ user_id: session.user.id, media_slug: slug });

    const { error } = await query;

    pendingSlugs.delete(slug);
    setSlugLoading(slug, false);

    if (error) {
        console.error("Favori güncellenemedi:", error);
        window.alert("Favori güncellenemedi. Lütfen tekrar deneyin.");
        return;
    }

    renderSlug(slug, !wasFavorite);

    if (wasFavorite) {
        document.dispatchEvent(new CustomEvent("popcorn:favorite-removed", {
            detail: { slug }
        }));
    }
}

export async function initFavoriteButtons() {
    const buttons = document.querySelectorAll("[data-favorite-button][data-media-slug]");
    if (buttons.length === 0) return;

    buttons.forEach((button) => {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");

        if (button.dataset.favoriteReady === "true") return;
        button.dataset.favoriteReady = "true";
        button.addEventListener("click", () => toggleFavorite(button));
    });

    const { data: { session } } = await supabase.auth.getSession();
    await syncFavoriteButtons(session);

    buttons.forEach((button) => {
        button.disabled = false;
        button.setAttribute("aria-busy", "false");
    });

    supabase.auth.onAuthStateChange((_event, nextSession) => {
        void syncFavoriteButtons(nextSession);
    });
}

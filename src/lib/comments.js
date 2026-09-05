import { supabase } from "./supabase.js";

const initializedSections = new WeakSet();
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
});

const createElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const normalizeBody = (value) => String(value ?? "").trim();

const validateBody = (value) => {
    const body = normalizeBody(value);

    if (body.length < 2) {
        return { body, error: "Yorum en az 2 karakter olmalıdır." };
    }

    if (body.length > 1000) {
        return { body, error: "Yorum en fazla 1000 karakter olabilir." };
    }

    return { body, error: "" };
};

const setMessage = (element, message = "", state = "") => {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    if (state) element.dataset.state = state;
    else delete element.dataset.state;
};

const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
};

const wasEdited = (comment) => {
    const createdAt = new Date(comment.created_at).getTime();
    const updatedAt = new Date(comment.updated_at).getTime();
    return Number.isFinite(createdAt) && Number.isFinite(updatedAt) && updatedAt - createdAt > 1000;
};

const initCommentSection = async (section) => {
    if (initializedSections.has(section)) return;
    initializedSections.add(section);

    const contentKey = section.dataset.contentKey?.trim();
    if (!contentKey) return;

    const list = section.querySelector("[data-comment-list]");
    const emptyState = section.querySelector("[data-comment-empty]");
    const loadStatus = section.querySelector("[data-comment-load-status]");
    const actionStatus = section.querySelector("[data-comment-action-status]");
    const count = section.querySelector("[data-comment-count]");
    const guest = section.querySelector("[data-comment-guest]");
    const form = section.querySelector("[data-comment-form]");
    const textarea = section.querySelector("[data-comment-textarea]");
    const characterCount = section.querySelector("[data-comment-character-count]");
    const submitButton = section.querySelector("[data-comment-submit]");
    const formStatus = section.querySelector("[data-comment-form-status]");

    const state = {
        session: null,
        comments: []
    };

    const showActionMessage = (message, messageState) => {
        setMessage(actionStatus, message, messageState);
    };

    const updateComposer = () => {
        const length = textarea?.value.length ?? 0;
        if (characterCount) characterCount.textContent = String(length);
        if (submitButton) submitButton.disabled = length < 2 || length > 1000;
    };

    const renderAuthState = () => {
        const isSignedIn = Boolean(state.session?.user);
        if (guest) guest.hidden = isSignedIn;
        if (form) form.hidden = !isSignedIn;
    };

    const loadComments = async ({ showLoading = true } = {}) => {
        if (showLoading) setMessage(loadStatus, "Yorumlar yükleniyor…", "loading");

        const { data, error } = await supabase.rpc("get_content_comments", {
            content_key: contentKey
        });

        if (error) {
            setMessage(loadStatus, "Yorumlar şu anda yüklenemedi. Lütfen daha sonra tekrar deneyin.", "error");
            return false;
        }

        state.comments = Array.isArray(data) ? data : [];
        setMessage(loadStatus);
        renderComments();
        return true;
    };

    const openEditor = (card, comment, bodyElement, actions) => {
        bodyElement.hidden = true;
        actions.hidden = true;

        const editForm = createElement("form", "comment-edit-form");
        editForm.noValidate = true;

        const editTextarea = createElement("textarea", "comment-edit-textarea");
        editTextarea.value = comment.body;
        editTextarea.maxLength = 1000;
        editTextarea.minLength = 2;
        editTextarea.rows = 4;
        editTextarea.setAttribute("aria-label", "Yorumu düzenle");

        const editFooter = createElement("div", "comment-edit-footer");
        const editCount = createElement("span", "comment-character-count", `${editTextarea.value.length}/1000`);
        const editButtons = createElement("div", "comment-edit-buttons");
        const cancelButton = createElement("button", "comment-action-button", "Vazgeç");
        cancelButton.type = "button";
        const saveButton = createElement("button", "comment-action-button comment-action-button-primary", "Kaydet");
        saveButton.type = "submit";
        const editStatus = createElement("p", "comment-inline-status");
        editStatus.hidden = true;

        editButtons.append(cancelButton, saveButton);
        editFooter.append(editCount, editButtons);
        editForm.append(editTextarea, editFooter, editStatus);
        actions.before(editForm);
        editTextarea.focus();
        editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);

        const closeEditor = () => {
            editForm.remove();
            bodyElement.hidden = false;
            actions.hidden = false;
        };

        const updateEditState = () => {
            const { error } = validateBody(editTextarea.value);
            editCount.textContent = `${editTextarea.value.length}/1000`;
            saveButton.disabled = Boolean(error);
        };

        editTextarea.addEventListener("input", updateEditState);
        cancelButton.addEventListener("click", closeEditor);
        updateEditState();

        editForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const validation = validateBody(editTextarea.value);

            if (validation.error) {
                setMessage(editStatus, validation.error, "error");
                return;
            }

            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.textContent = "Kaydediliyor…";
            setMessage(editStatus);

            const { error } = await supabase
                .from("comments")
                .update({ body: validation.body })
                .eq("id", comment.id);

            if (error) {
                saveButton.textContent = "Kaydet";
                cancelButton.disabled = false;
                updateEditState();
                setMessage(editStatus, "Yorum güncellenemedi. Lütfen tekrar deneyin.", "error");
                return;
            }

            closeEditor();
            await loadComments({ showLoading: false });
            showActionMessage("Yorumun güncellendi.", "success");
        });
    };

    const deleteComment = async (comment, button) => {
        const confirmed = window.confirm("Bu yorumu silmek istediğinden emin misin?");
        if (!confirmed) return;

        button.disabled = true;
        showActionMessage("Yorum siliniyor…", "loading");

        const { error } = await supabase
            .from("comments")
            .delete()
            .eq("id", comment.id);

        if (error) {
            button.disabled = false;
            showActionMessage("Yorum silinemedi. Lütfen tekrar deneyin.", "error");
            return;
        }

        state.comments = state.comments.filter((item) => item.id !== comment.id);
        renderComments();
        showActionMessage("Yorumun silindi.", "success");
    };

    const createCommentCard = (comment) => {
        const card = createElement("article", "comment-card");
        const cardHeader = createElement("header", "comment-card-header");
        const authorBlock = createElement("div", "comment-author");
        const displayName = String(comment.display_name ?? "").trim();
        const username = String(comment.username ?? "").trim();
        const authorName = createElement("strong", "", displayName || username || "Popcorn kullanıcısı");
        authorBlock.append(authorName);

        if (displayName && username) {
            authorBlock.append(createElement("span", "", `@${username}`));
        }

        const meta = createElement("div", "comment-meta");
        const time = createElement("time", "", formatDate(comment.created_at));
        time.dateTime = comment.created_at;
        meta.append(time);

        if (wasEdited(comment)) {
            meta.append(createElement("span", "comment-edited", "Düzenlendi"));
        }

        cardHeader.append(authorBlock, meta);
        const body = createElement("p", "comment-body", comment.body);
        card.append(cardHeader, body);

        if (state.session?.user?.id === comment.user_id) {
            const actions = createElement("div", "comment-actions");
            const editButton = createElement("button", "comment-action-button", "Düzenle");
            editButton.type = "button";
            const deleteButton = createElement("button", "comment-action-button comment-delete-button", "Sil");
            deleteButton.type = "button";

            editButton.addEventListener("click", () => openEditor(card, comment, body, actions));
            deleteButton.addEventListener("click", () => deleteComment(comment, deleteButton));
            actions.append(editButton, deleteButton);
            card.append(actions);
        }

        return card;
    };

    function renderComments() {
        if (!list) return;
        list.replaceChildren();

        const fragment = document.createDocumentFragment();
        state.comments.forEach((comment) => fragment.append(createCommentCard(comment)));
        list.append(fragment);

        if (count) {
            count.textContent = String(state.comments.length);
            count.setAttribute("aria-label", `${state.comments.length} yorum`);
        }

        if (emptyState) emptyState.hidden = state.comments.length !== 0;
    }

    textarea?.addEventListener("input", () => {
        updateComposer();
        setMessage(formStatus);
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const validation = validateBody(textarea?.value);

        if (validation.error) {
            setMessage(formStatus, validation.error, "error");
            return;
        }

        if (!state.session?.user) {
            renderAuthState();
            setMessage(formStatus, "Yorum yapmak için giriş yapmalısın.", "error");
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Gönderiliyor…";
        setMessage(formStatus, "Yorumun gönderiliyor…", "loading");

        const { error } = await supabase
            .from("comments")
            .insert({ content_key: contentKey, body: validation.body });

        if (error) {
            submitButton.textContent = "Yorum Gönder";
            updateComposer();
            setMessage(formStatus, "Yorum gönderilemedi. Lütfen tekrar deneyin.", "error");
            return;
        }

        textarea.value = "";
        submitButton.textContent = "Yorum Gönder";
        updateComposer();
        await loadComments({ showLoading: false });
        setMessage(formStatus, "Yorumun yayınlandı.", "success");
    });

    const { data: sessionData } = await supabase.auth.getSession();
    state.session = sessionData.session;
    renderAuthState();
    updateComposer();
    await loadComments();

    supabase.auth.onAuthStateChange((_event, nextSession) => {
        state.session = nextSession;
        renderAuthState();
        renderComments();
    });
};

export function initCommentSections() {
    document.querySelectorAll("[data-comment-section]").forEach((section) => {
        void initCommentSection(section);
    });
}

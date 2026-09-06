import { supabase } from "./supabase.js";

const initializedSections = new WeakSet();
const dateFormatter = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

const createElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
};

const normalizeBody = (value) => String(value ?? "").trim();
const validateBody = (value) => {
    const body = normalizeBody(value);
    if (body.length < 2) return { body, error: "Yorum en az 2 karakter olmalıdır." };
    if (body.length > 1000) return { body, error: "Yorum en fazla 1000 karakter olabilir." };
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
const normalizeComment = (comment) => ({
    ...comment,
    like_count: Number(comment.like_count) || 0,
    dislike_count: Number(comment.dislike_count) || 0,
    current_user_reaction: comment.current_user_reaction || null
});

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
    const state = { session: null, comments: [], activeReplyForm: null, pendingReactions: new Set() };

    const showActionMessage = (message, messageState) => setMessage(actionStatus, message, messageState);
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
        const { data, error } = await supabase.rpc("get_content_comments", { content_key: contentKey });
        if (error) {
            setMessage(loadStatus, "Yorumlar şu anda yüklenemedi. Lütfen daha sonra tekrar deneyin.", "error");
            return false;
        }
        state.comments = Array.isArray(data) ? data.map(normalizeComment) : [];
        setMessage(loadStatus);
        renderComments();
        return true;
    };

    const openEditor = (card, comment, bodyElement, footer, ownerActions) => {
        state.activeReplyForm?.remove();
        state.activeReplyForm = null;
        bodyElement.hidden = true;
        footer.hidden = true;
        if (ownerActions) ownerActions.hidden = true;
        const editForm = createElement("form", "comment-edit-form");
        editForm.noValidate = true;
        const editTextarea = createElement("textarea", "comment-edit-textarea");
        Object.assign(editTextarea, { value: comment.body, maxLength: 1000, minLength: 2, rows: 4 });
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
        footer.before(editForm);
        editTextarea.focus();
        editTextarea.setSelectionRange(editTextarea.value.length, editTextarea.value.length);
        const closeEditor = () => {
            editForm.remove();
            bodyElement.hidden = false;
            footer.hidden = false;
            if (ownerActions) ownerActions.hidden = false;
        };
        const updateEditState = () => {
            editCount.textContent = `${editTextarea.value.length}/1000`;
            saveButton.disabled = Boolean(validateBody(editTextarea.value).error);
        };
        editTextarea.addEventListener("input", updateEditState);
        cancelButton.addEventListener("click", closeEditor);
        updateEditState();
        editForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const validation = validateBody(editTextarea.value);
            if (validation.error) return setMessage(editStatus, validation.error, "error");
            saveButton.disabled = true;
            cancelButton.disabled = true;
            saveButton.textContent = "Kaydediliyor…";
            setMessage(editStatus);
            const { error } = await supabase.from("comments").update({ body: validation.body }).eq("id", comment.id);
            if (error) {
                saveButton.textContent = "Kaydet";
                cancelButton.disabled = false;
                updateEditState();
                return setMessage(editStatus, "Yorum güncellenemedi. Lütfen tekrar deneyin.", "error");
            }
            closeEditor();
            await loadComments({ showLoading: false });
            showActionMessage("Yorumun güncellendi.", "success");
        });
    };

    const deleteComment = async (comment, button) => {
        const isRoot = !comment.parent_id;
        const confirmation = isRoot
            ? "Bu yorumu ve tüm cevaplarını silmek istediğinden emin misin?"
            : "Bu cevabı silmek istediğinden emin misin?";
        if (!window.confirm(confirmation)) return;
        button.disabled = true;
        showActionMessage(isRoot ? "Yorum ve cevapları siliniyor…" : "Cevap siliniyor…", "loading");
        const { error } = await supabase.from("comments").delete().eq("id", comment.id);
        if (error) {
            button.disabled = false;
            return showActionMessage("Yorum silinemedi. Lütfen tekrar deneyin.", "error");
        }
        state.comments = state.comments.filter((item) => item.id !== comment.id && (!isRoot || item.parent_id !== comment.id));
        renderComments();
        showActionMessage(isRoot ? "Yorumun ve cevapları silindi." : "Cevabın silindi.", "success");
    };

    const submitReaction = async (comment, reaction) => {
        if (!state.session?.user) return showActionMessage("Tepki vermek için giriş yapmalısın.", "error");
        if (state.pendingReactions.has(comment.id)) return;
        const previous = {
            reaction: comment.current_user_reaction,
            likes: comment.like_count,
            dislikes: comment.dislike_count
        };
        const nextReaction = previous.reaction === reaction ? null : reaction;
        if (previous.reaction === "like") comment.like_count -= 1;
        if (previous.reaction === "dislike") comment.dislike_count -= 1;
        if (nextReaction === "like") comment.like_count += 1;
        if (nextReaction === "dislike") comment.dislike_count += 1;
        comment.current_user_reaction = nextReaction;
        state.pendingReactions.add(comment.id);
        renderComments();
        const { data, error } = await supabase.rpc("toggle_comment_reaction", {
            target_comment_id: comment.id,
            next_reaction: reaction
        });
        state.pendingReactions.delete(comment.id);
        if (error) {
            Object.assign(comment, {
                current_user_reaction: previous.reaction,
                like_count: previous.likes,
                dislike_count: previous.dislikes
            });
            renderComments();
            return showActionMessage("Tepkin kaydedilemedi. Lütfen tekrar dene.", "error");
        }
        comment.current_user_reaction = data || null;
        renderComments();
        setMessage(actionStatus);
    };

    const openReplyComposer = (card, comment) => {
        if (!state.session?.user) return showActionMessage("Cevap vermek için giriş yapmalısın.", "error");
        state.activeReplyForm?.remove();
        const replyForm = createElement("form", "comment-reply-form");
        replyForm.noValidate = true;
        state.activeReplyForm = replyForm;
        const targetUsername = String(comment.username ?? "").trim();
        const targetLabel = targetUsername ? `@${targetUsername}` : "bu kullanıcı";
        const context = createElement("p", "comment-reply-context");
        context.append(
            createElement("span", "comment-mention", targetLabel),
            document.createTextNode(" kullanıcısına yanıt veriyorsun")
        );
        const replyTextarea = createElement("textarea", "comment-reply-textarea");
        Object.assign(replyTextarea, { rows: 3, minLength: 2, maxLength: 1000, placeholder: "Yanıtını yaz…" });
        replyTextarea.setAttribute("aria-label", `${targetLabel} kullanıcısına yanıt`);
        const replyFooter = createElement("div", "comment-reply-footer");
        const replyCount = createElement("span", "comment-character-count", "0/1000");
        const replyButtons = createElement("div", "comment-reply-buttons");
        const cancelButton = createElement("button", "comment-action-button", "İptal");
        cancelButton.type = "button";
        const sendButton = createElement("button", "comment-action-button comment-action-button-primary", "Gönder");
        sendButton.type = "submit";
        sendButton.disabled = true;
        const replyStatus = createElement("p", "comment-inline-status");
        replyStatus.hidden = true;
        replyButtons.append(cancelButton, sendButton);
        replyFooter.append(replyCount, replyButtons);
        replyForm.append(context, replyTextarea, replyFooter, replyStatus);
        card.append(replyForm);
        replyTextarea.focus();
        const closeReply = () => {
            replyForm.remove();
            if (state.activeReplyForm === replyForm) state.activeReplyForm = null;
        };
        replyTextarea.addEventListener("input", () => {
            replyCount.textContent = `${replyTextarea.value.length}/1000`;
            sendButton.disabled = Boolean(validateBody(replyTextarea.value).error);
            setMessage(replyStatus);
        });
        cancelButton.addEventListener("click", closeReply);
        replyForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const validation = validateBody(replyTextarea.value);
            if (validation.error) return setMessage(replyStatus, validation.error, "error");
            sendButton.disabled = true;
            cancelButton.disabled = true;
            sendButton.textContent = "Gönderiliyor…";
            setMessage(replyStatus, "Cevabın gönderiliyor…", "loading");
            const { error } = await supabase.from("comments").insert({
                content_key: contentKey,
                body: validation.body,
                parent_id: comment.parent_id || comment.id,
                reply_to_comment_id: comment.id,
                reply_to_user_id: comment.user_id
            });
            if (error) {
                sendButton.textContent = "Gönder";
                cancelButton.disabled = false;
                sendButton.disabled = false;
                return setMessage(replyStatus, "Cevap gönderilemedi. Lütfen tekrar dene.", "error");
            }
            closeReply();
            await loadComments({ showLoading: false });
            showActionMessage("Cevabın yayınlandı.", "success");
        });
    };

    const createReactionButton = (comment, reaction, label, countValue) => {
        const isActive = comment.current_user_reaction === reaction;
        const button = createElement("button", `comment-reaction-button${isActive ? " is-active" : ""}`);
        button.type = "button";
        button.disabled = state.pendingReactions.has(comment.id);
        button.setAttribute("aria-pressed", String(isActive));
        button.setAttribute("aria-label", `${label}: ${countValue}`);
        button.append(
            createElement("span", "comment-reaction-icon", reaction === "like" ? "👍" : "👎"),
            createElement("span", "comment-reaction-count", String(countValue))
        );
        button.addEventListener("click", () => submitReaction(comment, reaction));
        return button;
    };

    const createCommentCard = (comment, isReply = false) => {
        const card = createElement("article", `comment-card${isReply ? " comment-card--reply" : ""}`);
        const cardHeader = createElement("header", "comment-card-header");
        const identity = createElement("div", "comment-identity");
        const authorBlock = createElement("div", "comment-author");
        const displayName = String(comment.display_name ?? "").trim();
        const username = String(comment.username ?? "").trim();
        authorBlock.append(createElement("strong", "", displayName || username || "Popcorn kullanıcısı"));
        if (displayName && username) authorBlock.append(createElement("span", "", `@${username}`));
        const meta = createElement("div", "comment-meta");
        const time = createElement("time", "", formatDate(comment.created_at));
        time.dateTime = comment.created_at;
        meta.append(time);
        if (wasEdited(comment)) meta.append(createElement("span", "comment-edited", "Düzenlendi"));
        identity.append(authorBlock, meta);
        cardHeader.append(identity);

        let ownerActions = null;
        const body = createElement("p", "comment-body");
        const footer = createElement("div", "comment-card-footer");
        if (state.session?.user?.id === comment.user_id) {
            ownerActions = createElement("div", "comment-owner-actions");
            const editButton = createElement("button", "comment-owner-button", "Düzenle");
            editButton.type = "button";
            const deleteButton = createElement("button", "comment-owner-button comment-delete-button", "Sil");
            deleteButton.type = "button";
            editButton.addEventListener("click", () => openEditor(card, comment, body, footer, ownerActions));
            deleteButton.addEventListener("click", () => deleteComment(comment, deleteButton));
            ownerActions.append(editButton, deleteButton);
            cardHeader.append(ownerActions);
        }

        const replyToUsername = String(comment.reply_to_username ?? "").trim();
        if (isReply && replyToUsername) {
            body.append(createElement("span", "comment-mention", `@${replyToUsername}`));
            body.append(document.createTextNode(` ${comment.body}`));
        } else body.textContent = comment.body;

        footer.append(
            createReactionButton(comment, "like", "Beğen", comment.like_count),
            createReactionButton(comment, "dislike", "Beğenme", comment.dislike_count)
        );
        const replyButton = createElement("button", "comment-reply-button", "Cevapla");
        replyButton.type = "button";
        replyButton.addEventListener("click", () => openReplyComposer(card, comment));
        footer.append(replyButton);
        card.append(cardHeader, body, footer);
        return card;
    };

    function renderComments() {
        if (!list) return;
        state.activeReplyForm = null;
        list.replaceChildren();
        const repliesByRoot = new Map();
        state.comments.filter((comment) => comment.parent_id).forEach((reply) => {
            const replies = repliesByRoot.get(reply.parent_id) ?? [];
            replies.push(reply);
            repliesByRoot.set(reply.parent_id, replies);
        });
        const fragment = document.createDocumentFragment();
        state.comments.filter((comment) => !comment.parent_id).forEach((rootComment) => {
            const thread = createElement("div", "comment-thread");
            thread.append(createCommentCard(rootComment));
            const replies = repliesByRoot.get(rootComment.id) ?? [];
            if (replies.length) {
                const replyList = createElement("div", "comment-replies");
                replies.forEach((reply) => replyList.append(createCommentCard(reply, true)));
                thread.append(replyList);
            }
            fragment.append(thread);
        });
        list.append(fragment);
        if (count) {
            count.textContent = String(state.comments.length);
            count.setAttribute("aria-label", `${state.comments.length} yorum ve cevap`);
        }
        if (emptyState) emptyState.hidden = state.comments.length !== 0;
    }

    textarea?.addEventListener("input", () => { updateComposer(); setMessage(formStatus); });
    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const validation = validateBody(textarea?.value);
        if (validation.error) return setMessage(formStatus, validation.error, "error");
        if (!state.session?.user) {
            renderAuthState();
            return setMessage(formStatus, "Yorum yapmak için giriş yapmalısın.", "error");
        }
        submitButton.disabled = true;
        submitButton.textContent = "Gönderiliyor…";
        setMessage(formStatus, "Yorumun gönderiliyor…", "loading");
        const { error } = await supabase.from("comments").insert({ content_key: contentKey, body: validation.body });
        if (error) {
            submitButton.textContent = "Yorum Gönder";
            updateComposer();
            return setMessage(formStatus, "Yorum gönderilemedi. Lütfen tekrar deneyin.", "error");
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
    document.querySelectorAll("[data-comment-section]").forEach((section) => void initCommentSection(section));
}

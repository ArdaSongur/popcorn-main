    alter table public.comments
        add column if not exists parent_id uuid null
            references public.comments(id) on delete cascade,
        add column if not exists reply_to_comment_id uuid null
            references public.comments(id) on delete set null,
        add column if not exists reply_to_user_id uuid null
            references auth.users(id) on delete set null;

    create index if not exists comments_content_key_parent_created_at_idx
        on public.comments (content_key, parent_id, created_at);

    create index if not exists comments_reply_to_comment_id_idx
        on public.comments (reply_to_comment_id)
        where reply_to_comment_id is not null;

    create index if not exists comments_reply_to_user_id_idx
        on public.comments (reply_to_user_id)
        where reply_to_user_id is not null;

    create or replace function public.validate_comment_reply()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
        target_comment public.comments%rowtype;
        expected_root_id uuid;
    begin
        if new.parent_id is null
        and new.reply_to_comment_id is null
        and new.reply_to_user_id is null then
            return new;
        end if;

        if new.parent_id is null
        or new.reply_to_comment_id is null
        or new.reply_to_user_id is null then
            raise exception 'Cevap ilişkisi eksik.' using errcode = '23514';
        end if;

        select c.*
        into target_comment
        from public.comments as c
        where c.id = new.reply_to_comment_id
        and not c.is_hidden;

        if not found then
            raise exception 'Yanıtlanan yorum bulunamadı.' using errcode = '23503';
        end if;

        if target_comment.content_key <> new.content_key then
            raise exception 'Yanıtlanan yorum farklı bir içeriğe ait.' using errcode = '23514';
        end if;

        if target_comment.user_id <> new.reply_to_user_id then
            raise exception 'Yanıt hedefi kullanıcıyla eşleşmiyor.' using errcode = '23514';
        end if;

        expected_root_id := coalesce(target_comment.parent_id, target_comment.id);

        if new.parent_id <> expected_root_id then
            raise exception 'Cevap doğru ana yoruma bağlı değil.' using errcode = '23514';
        end if;

        if not exists (
            select 1
            from public.comments as root_comment
            where root_comment.id = expected_root_id
            and root_comment.parent_id is null
            and root_comment.content_key = new.content_key
            and not root_comment.is_hidden
        ) then
            raise exception 'Ana yorum bulunamadı veya içerikle eşleşmiyor.' using errcode = '23514';
        end if;

        return new;
    end;
    $$;

    revoke all on function public.validate_comment_reply() from public;

    drop trigger if exists comments_validate_reply on public.comments;
    create trigger comments_validate_reply
        before insert on public.comments
        for each row
        execute function public.validate_comment_reply();

    grant insert (parent_id, reply_to_comment_id, reply_to_user_id)
        on table public.comments to authenticated;

    create table if not exists public.comment_reactions (
        id uuid primary key default gen_random_uuid(),
        comment_id uuid not null references public.comments(id) on delete cascade,
        user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
        reaction text not null,
        created_at timestamptz not null default now(),
        constraint comment_reactions_allowed_reaction check (reaction in ('like', 'dislike')),
        constraint comment_reactions_user_comment_unique unique (user_id, comment_id)
    );

    create index if not exists comment_reactions_comment_reaction_idx
        on public.comment_reactions (comment_id, reaction);

    alter table public.comment_reactions enable row level security;

    revoke all on table public.comment_reactions from public;
    revoke all on table public.comment_reactions from anon;
    revoke all on table public.comment_reactions from authenticated;

    grant usage on schema public to anon, authenticated;
    grant select (comment_id, reaction) on table public.comment_reactions to anon, authenticated;
    grant insert (comment_id, reaction) on table public.comment_reactions to authenticated;
    grant update (reaction) on table public.comment_reactions to authenticated;
    grant delete on table public.comment_reactions to authenticated;
    grant all on table public.comment_reactions to service_role;

    drop policy if exists "Comment reaction totals are RPC-readable" on public.comment_reactions;
    create policy "Comment reaction totals are RPC-readable"
        on public.comment_reactions
        for select
        to anon, authenticated
        using (true);

    drop policy if exists "Users can create own comment reactions" on public.comment_reactions;
    create policy "Users can create own comment reactions"
        on public.comment_reactions
        for insert
        to authenticated
        with check ((select auth.uid()) = user_id);

    drop policy if exists "Users can update own comment reactions" on public.comment_reactions;
    create policy "Users can update own comment reactions"
        on public.comment_reactions
        for update
        to authenticated
        using ((select auth.uid()) = user_id)
        with check ((select auth.uid()) = user_id);

    drop policy if exists "Users can delete own comment reactions" on public.comment_reactions;
    create policy "Users can delete own comment reactions"
        on public.comment_reactions
        for delete
        to authenticated
        using ((select auth.uid()) = user_id);

    create or replace function public.toggle_comment_reaction(
        target_comment_id uuid,
        next_reaction text
    )
    returns text
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
        actor_id uuid := auth.uid();
        existing_reaction text;
    begin
        if actor_id is null then
            raise exception 'Giriş yapmanız gerekiyor.' using errcode = '42501';
        end if;

        if next_reaction not in ('like', 'dislike') then
            raise exception 'Geçersiz reaksiyon.' using errcode = '23514';
        end if;

        if not exists (
            select 1
            from public.comments as c
            where c.id = target_comment_id
            and not c.is_hidden
        ) then
            raise exception 'Yorum bulunamadı.' using errcode = '23503';
        end if;

        select cr.reaction
        into existing_reaction
        from public.comment_reactions as cr
        where cr.user_id = actor_id
        and cr.comment_id = target_comment_id
        for update;

        if existing_reaction = next_reaction then
            delete from public.comment_reactions
            where user_id = actor_id
            and comment_id = target_comment_id;
            return null;
        end if;

        insert into public.comment_reactions (comment_id, user_id, reaction)
        values (target_comment_id, actor_id, next_reaction)
        on conflict (user_id, comment_id)
        do update set reaction = excluded.reaction;

        return next_reaction;
    end;
    $$;

    revoke all on function public.toggle_comment_reaction(uuid, text) from public;
    grant execute on function public.toggle_comment_reaction(uuid, text) to authenticated;

    drop function if exists public.get_content_comments(text);
    create function public.get_content_comments(content_key text)
    returns table (
        id uuid,
        user_id uuid,
        body text,
        parent_id uuid,
        reply_to_comment_id uuid,
        reply_to_user_id uuid,
        reply_to_username text,
        created_at timestamptz,
        updated_at timestamptz,
        display_name text,
        username text,
        like_count bigint,
        dislike_count bigint,
        current_user_reaction text
    )
    language sql
    stable
    security definer
    set search_path = ''
    as $$
        select
            c.id,
            c.user_id,
            c.body,
            c.parent_id,
            c.reply_to_comment_id,
            c.reply_to_user_id,
            reply_profile.username as reply_to_username,
            c.created_at,
            c.updated_at,
            author_profile.display_name,
            author_profile.username,
            (
                select count(*)
                from public.comment_reactions as likes
                where likes.comment_id = c.id
                and likes.reaction = 'like'
            ) as like_count,
            (
                select count(*)
                from public.comment_reactions as dislikes
                where dislikes.comment_id = c.id
                and dislikes.reaction = 'dislike'
            ) as dislike_count,
            (
                select own_reaction.reaction
                from public.comment_reactions as own_reaction
                where own_reaction.comment_id = c.id
                and own_reaction.user_id = auth.uid()
            ) as current_user_reaction
        from public.comments as c
        left join public.profiles as author_profile on author_profile.id = c.user_id
        left join public.profiles as reply_profile on reply_profile.id = c.reply_to_user_id
        where c.content_key = btrim($1)
        and not c.is_hidden
        and (
            c.parent_id is null
            or exists (
                select 1
                    from public.comments as root_comment
                where root_comment.id = c.parent_id
                    and root_comment.content_key = c.content_key
                    and root_comment.parent_id is null
                    and not root_comment.is_hidden
            )
        )
        order by c.created_at asc, c.id asc;
    $$;

    revoke all on function public.get_content_comments(text) from public;
    grant execute on function public.get_content_comments(text) to anon, authenticated;

    comment on table public.comment_reactions is
        'Yorum başına kullanıcı like/dislike seçimi; herkese açık arayüz yalnızca RPC toplamlarını gösterir.';

    comment on function public.toggle_comment_reaction(uuid, text) is
        'Giriş yapan kullanıcının bir yorumdaki reaksiyonunu atomik olarak ekler, değiştirir veya kaldırır.';

    comment on function public.get_content_comments(text) is
        'Yorumları, tek seviyeli cevap ilişkilerini ve kimlik açmadan reaksiyon toplamlarını döndürür.';

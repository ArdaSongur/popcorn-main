create table if not exists public.comments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    content_key text not null,
    body text not null,
    is_hidden boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint comments_content_key_not_blank check (
        char_length(btrim(content_key)) > 0
    ),
    constraint comments_body_trimmed_length check (
        body = btrim(body)
        and char_length(body) between 2 and 1000
    )
);

create index if not exists comments_content_key_created_at_idx
    on public.comments (content_key, created_at);

create index if not exists comments_user_id_idx
    on public.comments (user_id);

alter table public.comments enable row level security;

revoke all on table public.comments from public;
revoke all on table public.comments from anon;
revoke all on table public.comments from authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.comments to anon, authenticated;
grant insert (content_key, body) on table public.comments to authenticated;
grant update (body) on table public.comments to authenticated;
grant delete on table public.comments to authenticated;
grant all on table public.comments to service_role;

drop policy if exists "Visible comments are public" on public.comments;
create policy "Visible comments are public"
    on public.comments
    for select
    to anon, authenticated
    using (not is_hidden);

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
    on public.comments
    for insert
    to authenticated
    with check (
        (select auth.uid()) = user_id
        and not is_hidden
    );

drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own comments"
    on public.comments
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check (
        (select auth.uid()) = user_id
        and not is_hidden
    );

drop policy if exists "Users can delete own comments" on public.comments;
create policy "Users can delete own comments"
    on public.comments
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);

create or replace function public.normalize_comment_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.body := btrim(new.body);

    if tg_op = 'INSERT' then
        new.content_key := btrim(new.content_key);
    end if;

    return new;
end;
$$;

revoke all on function public.normalize_comment_fields() from public;

drop trigger if exists comments_normalize_fields on public.comments;
create trigger comments_normalize_fields
    before insert or update on public.comments
    for each row
    execute function public.normalize_comment_fields();

create or replace function public.set_comment_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

revoke all on function public.set_comment_updated_at() from public;

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
    before update on public.comments
    for each row
    execute function public.set_comment_updated_at();

create or replace function public.get_content_comments(content_key text)
returns table (
    id uuid,
    user_id uuid,
    body text,
    created_at timestamptz,
    updated_at timestamptz,
    display_name text,
    username text
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
        c.created_at,
        c.updated_at,
        p.display_name,
        p.username
    from public.comments as c
    left join public.profiles as p on p.id = c.user_id
    where c.content_key = btrim($1)
      and not c.is_hidden
    order by c.created_at asc, c.id asc;
$$;

revoke all on function public.get_content_comments(text) from public;
grant execute on function public.get_content_comments(text) to anon, authenticated;

comment on table public.comments is
    'İçeriklere ait kullanıcı yorumları; is_hidden alanı dashboard moderasyonu içindir.';

comment on function public.get_content_comments(text) is
    'Gizlenmemiş yorumları yalnızca güvenli, herkese açık profil alanlarıyla döndürür.';

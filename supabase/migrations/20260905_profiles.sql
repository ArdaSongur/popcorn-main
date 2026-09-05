create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint profiles_username_format check (
        username = lower(username)
        and username ~ '^[a-z0-9_]{3,24}$'
    )
);

create unique index if not exists profiles_username_lower_unique
    on public.profiles (lower(username));

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.profiles to service_role;
grant update (username) on table public.profiles to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
    on public.profiles
    for select
    to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_profile_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    requested_username text := lower(trim(new.raw_user_meta_data ->> 'username'));
begin
    if requested_username is null
        or requested_username !~ '^[a-z0-9_]{3,24}$' then
        raise exception using
            errcode = 'check_violation',
            message = 'invalid_username';
    end if;

    insert into public.profiles (id, username)
    values (new.id, requested_username);

    return new;
exception
    when unique_violation then
        raise exception using
            errcode = 'unique_violation',
            message = 'username_already_exists';
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
    after insert on auth.users
    for each row
    execute function public.handle_new_user_profile();

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        candidate is not null
        and lower(trim(candidate)) ~ '^[a-z0-9_]{3,24}$'
        and not exists (
            select 1
            from public.profiles
            where lower(username) = lower(trim(candidate))
              and id is distinct from auth.uid()
        );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Mevcut auth kullanıcılarına dokunmadan eksik profilleri tamamlar.
-- Geçerli ve müsait metadata username'i kullanılır; diğer durumlarda benzersiz
-- ve kurallara uygun bir user_<hash> değeri üretilir.
do $$
declare
    auth_user record;
    requested_username text;
    generated_username text;
    attempt integer;
begin
    for auth_user in
        select u.id, u.raw_user_meta_data
        from auth.users as u
        where not exists (
            select 1 from public.profiles as p where p.id = u.id
        )
        order by u.created_at, u.id
    loop
        requested_username := lower(trim(auth_user.raw_user_meta_data ->> 'username'));

        if requested_username ~ '^[a-z0-9_]{3,24}$'
            and not exists (
                select 1
                from public.profiles
                where lower(username) = requested_username
            ) then
            generated_username := requested_username;
        else
            generated_username := 'user_' || substr(md5(auth_user.id::text), 1, 19);
        end if;

        attempt := 0;
        loop
            begin
                insert into public.profiles (id, username)
                values (auth_user.id, generated_username);
                exit;
            exception
                when unique_violation then
                    attempt := attempt + 1;
                    generated_username := 'user_' || substr(
                        md5(auth_user.id::text || ':' || attempt::text),
                        1,
                        19
                    );
            end;
        end loop;
    end loop;
end;
$$;

comment on table public.profiles is
    'Kullanıcıların yalnızca kendi satırlarını okuyup güncelleyebildiği profil bilgileri.';

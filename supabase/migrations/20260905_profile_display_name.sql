alter table public.profiles
    add column display_name text;

alter table public.profiles
    add constraint profiles_display_name_max_length
    check (char_length(display_name) <= 50);

grant update (display_name) on table public.profiles to authenticated;
grant select on table public.profiles to service_role;

-- Tablo seviyesindeki mevcut SELECT izinleri yeni sütunu da kapsar.
-- Mevcut RLS politikaları ve service_role yetkileri değiştirilmez.

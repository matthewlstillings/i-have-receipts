-- Shared people + per-app access for every friends app in Personal Projects.
--
--   core.people      one row per person, shared by every app (name, nickname, avatar, on/off)
--   core.apps        one row per app ('receipts', ...)
--   core.app_access  who may use which app; revoking sets revoked_at so history keeps names
--
-- Every app's rules start with core.has_app('<app>'): signed in, account on,
-- and access to THAT app. A friend who only uses Receipts and Project B sees
-- their own rows in those two apps and nothing anywhere else.
--
-- Admin work (adding people, granting apps, fixing data) happens in the
-- Supabase dashboard / SQL editor only, which already bypasses RLS. There is
-- no admin override in any app's rules and no admin UI.
--
-- Receipts moves onto it: receipts.profiles becomes a view over core.people
-- (same columns the app already reads), and every receipts foreign key that
-- pointed at receipts.profiles now points at core.people.

create schema if not exists core;
grant usage on schema core to authenticated, service_role;

create type core.account_status as enum ('active', 'off');

create table core.people (
  id                uuid primary key references auth.users (id) on delete restrict,
  display_name      text not null check (char_length(display_name) between 2 and 24),
  nickname          text check (char_length(nickname) between 1 and 20),
  phone             text unique check (phone ~ '^\+1[0-9]{10}$'),
  avatar_path       text,
  status            core.account_status not null default 'active',
  status_changed_at timestamptz,
  is_owner          boolean not null default false,   -- Matthew; informational only, grants nothing
  created_at        timestamptz not null default now()
);

create table core.apps (
  key  text primary key check (key ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text not null
);
insert into core.apps (key, name) values ('receipts', 'I Have Receipts');

create table core.app_access (
  user_id    uuid not null references core.people (id),
  app_key    text not null references core.apps (key),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, app_key)
);

-- ---------------------------------------------------------------- checks
-- Signed in, account on, and allowed into this app.
create or replace function core.has_app(p_app text) returns boolean
language sql stable security definer set search_path = core as $$
  select exists (
    select 1 from people p join app_access a on a.user_id = p.id
    where p.id = auth.uid() and p.status = 'active'
      and a.app_key = p_app and a.revoked_at is null)
$$;

-- The signed-in person and p_user share at least one app the caller can use
-- right now (for the directory: you only see people from your own apps).
create or replace function core.shares_app(p_user uuid) returns boolean
language sql stable security definer set search_path = core as $$
  select exists (
    select 1 from people me
    join app_access mine on mine.user_id = me.id and mine.revoked_at is null
    join app_access theirs on theirs.app_key = mine.app_key
    where me.id = auth.uid() and me.status = 'active' and theirs.user_id = p_user)
$$;

alter table core.people     enable row level security;
alter table core.apps       enable row level security;
alter table core.app_access enable row level security;

create policy people_read on core.people for select to authenticated
  using (core.shares_app(id));
create policy apps_read on core.apps for select to authenticated
  using (core.has_app(key));
create policy access_read on core.app_access for select to authenticated
  using (core.has_app(app_key));

revoke all on all tables in schema core from anon, authenticated;
grant select on core.people, core.apps, core.app_access to authenticated;
grant all on all tables in schema core to service_role;

-- ---------------------------------------------------------------- admin (SQL editor only)
-- Create the login first: Authentication > Users > Add user.
create or replace function core.add_person(p_email text, p_name text, p_apps text[], p_owner boolean default false)
returns uuid language plpgsql security definer set search_path = core as $$
declare v uuid; a text;
begin
  select id into v from auth.users where lower(email) = lower(btrim(p_email));
  if v is null then raise exception 'Create % under Authentication > Users first', p_email; end if;
  insert into people (id, display_name, is_owner) values (v, btrim(p_name), p_owner)
  on conflict (id) do update set display_name = excluded.display_name, is_owner = people.is_owner or excluded.is_owner;
  foreach a in array coalesce(p_apps, '{}') loop
    perform core.grant_app(p_email, a);
  end loop;
  return v;
end $$;

create or replace function core.grant_app(p_email text, p_app text)
returns void language plpgsql security definer set search_path = core as $$
declare v uuid;
begin
  select id into v from auth.users where lower(email) = lower(btrim(p_email));
  if v is null or not exists (select 1 from people where id = v) then raise exception 'Add % with core.add_person first', p_email; end if;
  insert into app_access (user_id, app_key) values (v, p_app)
  on conflict (user_id, app_key) do update set revoked_at = null, granted_at = now();
  if p_app = 'receipts' then
    insert into receipts.profile_settings (user_id) values (v) on conflict do nothing;
  end if;
end $$;

create or replace function core.revoke_app(p_email text, p_app text)
returns void language sql security definer set search_path = core as $$
  update app_access set revoked_at = now()
  where app_key = p_app and user_id = (select id from auth.users where lower(email) = lower(btrim(p_email)))
$$;

-- Turn someone off everywhere (or back on). History stays.
create or replace function core.set_status(p_email text, p_status core.account_status)
returns void language sql security definer set search_path = core as $$
  update people set status = p_status, status_changed_at = now()
  where id = (select id from auth.users where lower(email) = lower(btrim(p_email)))
$$;

revoke execute on all functions in schema core from public, anon, authenticated;
grant execute on function core.has_app(text), core.shares_app(uuid) to authenticated;

-- ================================================================ Receipts on core
-- 1. Repoint every foreign key from receipts.profiles to core.people.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = 'receipts.profiles'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname,
                   replace(r.def, 'receipts.profiles', 'core.people'));
  end loop;
end $$;

-- 2. Move any existing Receipts people into core (none in production yet; keeps it safe to rerun).
insert into core.people (id, display_name, nickname, phone, avatar_path, status, status_changed_at, is_owner, created_at)
select id, display_name, nickname, phone, avatar_path, status::text::core.account_status, status_changed_at, is_admin, created_at
from receipts.profiles on conflict (id) do nothing;
insert into core.app_access (user_id, app_key)
select id, 'receipts' from receipts.profiles on conflict do nothing;

-- 3. receipts.profiles becomes a view: everyone who has ever had Receipts
--    access (so old expenses keep their names). Someone whose access was
--    revoked shows as turned off. security_invoker: core.people's rules apply.
drop table receipts.profiles;
create view receipts.profiles with (security_invoker = true) as
  select p.id, p.display_name, p.nickname, p.phone, p.avatar_path,
         (case when a.revoked_at is null then p.status::text else 'off' end)::receipts.account_status as status,
         p.status_changed_at, false as is_admin, p.created_at
  from core.people p join core.app_access a on a.user_id = p.id and a.app_key = 'receipts';
grant select on receipts.profiles to authenticated, service_role;

-- 4. Receipts' "is this person in" check is now the shared one.
create or replace function receipts_app.is_active() returns boolean
language sql stable security definer set search_path = receipts as $$
  select core.has_app('receipts')
$$;

-- 5. The person edits their own nickname on core.people (shared by every app).
create or replace function receipts.finish_welcome(p_nickname text)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.assert_active();
  update core.people set nickname = nullif(btrim(p_nickname), '') where id = auth.uid();
  insert into profile_settings (user_id, welcomed_at) values (auth.uid(), now())
  on conflict (user_id) do update set welcomed_at = coalesce(profile_settings.welcomed_at, now());
end $$;

create or replace function receipts.update_my_profile(p_nickname text)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.assert_active();
  update core.people set nickname = nullif(btrim(p_nickname), '') where id = auth.uid();
end $$;

-- 6. The old Receipts-only helper now forwards to core.
create or replace function receipts_app.add_person(p_email text, p_name text, p_admin boolean default false)
returns uuid language sql security definer set search_path = receipts as $$
  select core.add_person(p_email, p_name, array['receipts'], p_admin)
$$;

-- People inside Receipts' checks: "active" now means active in core AND
-- still allowed into Receipts. The view above already folds both into status.
revoke execute on function receipts_app.add_person(text, text, boolean) from public, anon, authenticated;
revoke execute on function receipts.finish_welcome(text), receipts.update_my_profile(text) from public, anon;
grant execute on function receipts.finish_welcome(text), receipts.update_my_profile(text) to authenticated;

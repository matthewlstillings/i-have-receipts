-- I Have Receipts: MVP schema (step 3 of the build plan)
-- Every table has RLS on. Clients read through RLS and write only through
-- the RPC functions at the bottom (security definer), so multi-row writes
-- stay atomic and money rules (sums, ranges, archived groups) are enforced
-- in one place. See "3 · Data model" in the build plan doc for the why.

create schema if not exists app;

-- ---------------------------------------------------------------- enums
create type public.category as enum
  ('food', 'entertainment', 'home', 'life', 'transport', 'utilities', 'uncategorized');
create type public.group_kind as enum ('trip', 'home', 'couple', 'other');
create type public.split_method as enum ('equal', 'exact', 'percent');
create type public.account_status as enum ('active', 'off');
create type public.activity_kind as enum (
  'expense_added', 'expense_edited', 'expense_deleted', 'expense_restored',
  'payment_added', 'payment_edited', 'payment_deleted',
  'member_added', 'member_left',
  'group_created', 'group_edited', 'group_archived', 'group_reopened',
  'pair_linked', 'pair_unlinked');
create type public.sms_kind as enum ('added_to_group', 'expenses', 'payment');

-- ---------------------------------------------------------------- people
-- Public profile: every signed-in person can read every row.
-- Email is NOT copied here; it stays in auth.users (D-01).
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete restrict,
  display_name  text not null check (char_length(display_name) between 2 and 24),
  nickname      text check (char_length(nickname) between 1 and 20),
  phone         text not null unique check (phone ~ '^\+1[0-9]{10}$'),
  avatar_path   text,                                -- storage key in 'avatars'
  status        public.account_status not null default 'active',
  status_changed_at timestamptz,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Private settings: only the person can read them (D-02).
create table public.profile_settings (
  user_id         uuid primary key references public.profiles (id),
  welcomed_at     timestamptz,                       -- finished A4
  sms_consent_at  timestamptz,                       -- null = no texts at all
  sms_invites     boolean not null default true,
  sms_expenses    boolean not null default true,
  sms_payments    boolean not null default true,
  sms_stopped_at  timestamptz                        -- carrier STOP received
);

-- ---------------------------------------------------------------- groups
create table public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 32),
  kind             public.group_kind not null default 'other',   -- the group's icon (R-13)
  created_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  archived_at      timestamptz,
  archived_by      uuid references public.profiles (id)
);

-- Leaving keeps the row with left_at set, so old splits still point at a
-- real membership (D-06). Rejoining clears left_at.
create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id),
  added_by  uuid references public.profiles (id),
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (group_id, user_id)
);
create index group_members_user_active on public.group_members (user_id) where left_at is null;

-- Linked pairs: a separate table so RLS can hide it from everyone but the
-- two partners (D-07). user_a < user_b keeps one row per pair.
create table public.group_pairs (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_a     uuid not null references public.profiles (id),
  user_b     uuid not null references public.profiles (id),
  linked_by  uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  ended_at   timestamptz,
  check (user_a < user_b)
);
create unique index group_pairs_one_per_a on public.group_pairs (group_id, user_a) where ended_at is null;
create unique index group_pairs_one_per_b on public.group_pairs (group_id, user_b) where ended_at is null;
-- (a person appearing as user_a in one pair and user_b in another is
--  blocked inside app.link_partner, which locks the group first)

-- ---------------------------------------------------------------- money
-- All money is whole cents (D-10).
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  description  text not null check (char_length(btrim(description)) between 1 and 60),
  notes        text check (char_length(notes) <= 280),
  amount_cents integer not null check (amount_cents between 1 and 9999999),
  category     public.category not null default 'uncategorized',
  category_picked boolean not null default false,  -- false = guessed by the app
  paid_by      uuid not null references public.profiles (id),
  split_method public.split_method not null default 'equal',
  spent_on     date not null,                        -- not in the future: checked in RPC
  version      integer not null default 1,           -- optimistic lock (D-08)
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id),
  updated_at   timestamptz,
  deleted_at   timestamptz,                          -- soft delete (D-12)
  deleted_by   uuid references public.profiles (id)
);
create index expenses_group_list on public.expenses (group_id, spent_on desc, created_at desc);

-- Each person's stored share. percent_bp (basis points, 10000 = 100%) and
-- exact_cents keep what was typed so the edit screen can show it again;
-- amount_cents is the result.
create table public.expense_shares (
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  percent_bp   integer check (percent_bp between 0 and 10000),
  exact_cents  integer check (exact_cents between 0 and 9999999),
  amount_cents integer not null check (amount_cents >= 0),
  primary key (expense_id, user_id)
);
create index expense_shares_user on public.expense_shares (user_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_user    uuid not null references public.profiles (id),
  to_user      uuid not null references public.profiles (id),
  amount_cents integer not null check (amount_cents between 1 and 9999999),
  paid_on      date not null default current_date,
  version      integer not null default 1,
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles (id),
  updated_at   timestamptz,
  deleted_at   timestamptz,
  deleted_by   uuid references public.profiles (id),
  check (from_user <> to_user)
);
create index payments_group on public.payments (group_id, paid_on desc);

-- ---------------------------------------------------------------- activity
-- visible_to = null means every member; pair events list the two partners.
create table public.activity (
  id          bigint generated always as identity primary key,
  group_id    uuid not null references public.groups (id) on delete cascade,
  actor_id    uuid not null references public.profiles (id),
  kind        public.activity_kind not null,
  expense_id  uuid references public.expenses (id) on delete set null,
  payment_id  uuid references public.payments (id) on delete set null,
  subject_user uuid references public.profiles (id),   -- member added / left
  detail      jsonb not null default '{}'::jsonb,      -- before / after values
  visible_to  uuid[],
  created_at  timestamptz not null default now()
);
create index activity_group_time on public.activity (group_id, created_at desc);

-- ---------------------------------------------------------------- texts
-- Server-only queue. Users never read it (no select policy).
create table public.sms_outbox (
  id             bigint generated always as identity primary key,
  recipient_id   uuid not null references public.profiles (id),
  group_id       uuid not null references public.groups (id) on delete cascade,
  kind           public.sms_kind not null,
  window_ends_at timestamptz not null,
  payload        jsonb not null default '{}'::jsonb,   -- counts, totals, names
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now()
);
create unique index sms_outbox_one_open_batch
  on public.sms_outbox (recipient_id, group_id)
  where status = 'pending' and kind = 'expenses';
create index sms_outbox_due on public.sms_outbox (window_ends_at) where status = 'pending';

-- ---------------------------------------------------------------- phase 2
create table public.receipts (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  storage_path text not null,
  uploaded_by  uuid not null references public.profiles (id),
  created_at   timestamptz not null default now()
);

-- ================================================================ helpers
create or replace function app.me() returns uuid
language sql stable as $$ select auth.uid() $$;

-- True only for a signed-in person whose account is on. Every policy uses it,
-- so turning an account off cuts access on the next request (S-04).
create or replace function app.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active')
$$;

create or replace function app.is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members
                 where group_id = g and user_id = auth.uid() and left_at is null)
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin and status = 'active')
$$;

-- ================================================================ RLS
alter table public.profiles         enable row level security;
alter table public.profile_settings enable row level security;
alter table public.groups           enable row level security;
alter table public.group_members    enable row level security;
alter table public.group_pairs      enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_shares   enable row level security;
alter table public.payments         enable row level security;
alter table public.activity         enable row level security;
alter table public.sms_outbox       enable row level security;
alter table public.receipts         enable row level security;

-- Read policies only. No insert/update/delete policies exist: writes go
-- through the RPCs below (D-03).
create policy profiles_read on public.profiles for select to authenticated
  using (app.is_active());

create policy settings_read_own on public.profile_settings for select to authenticated
  using (user_id = auth.uid() and app.is_active());

create policy groups_read on public.groups for select to authenticated
  using (app.is_active() and app.is_member(id));

create policy members_read on public.group_members for select to authenticated
  using (app.is_active() and app.is_member(group_id));

create policy pairs_read_own on public.group_pairs for select to authenticated
  using (app.is_active() and auth.uid() in (user_a, user_b));

create policy expenses_read on public.expenses for select to authenticated
  using (app.is_active() and app.is_member(group_id));   -- deleted rows too, for Restore

create policy shares_read on public.expense_shares for select to authenticated
  using (app.is_active() and exists (
    select 1 from public.expenses e where e.id = expense_id and app.is_member(e.group_id)));

create policy payments_read on public.payments for select to authenticated
  using (app.is_active() and app.is_member(group_id));

create policy activity_read on public.activity for select to authenticated
  using (app.is_active() and app.is_member(group_id)
         and (visible_to is null or auth.uid() = any (visible_to)));

create policy receipts_read on public.receipts for select to authenticated
  using (app.is_active() and exists (
    select 1 from public.expenses e where e.id = expense_id and app.is_member(e.group_id)));

-- ================================================================ balances
-- Net per member in one group: positive = is owed, negative = owes.
-- Computed every time, never stored (D-04). Includes people who left or
-- were turned off, so the group always sums to zero.
create or replace function app.group_nets(g uuid)
returns table (user_id uuid, net_cents bigint)
language sql stable security definer set search_path = public as $$
  with paid as (
    select paid_by as user_id, sum(amount_cents)::bigint as c
    from expenses where group_id = g and deleted_at is null group by paid_by
  ), owed as (
    select s.user_id, sum(s.amount_cents)::bigint as c
    from expense_shares s join expenses e on e.id = s.expense_id
    where e.group_id = g and e.deleted_at is null group by s.user_id
  ), sent as (
    select from_user as user_id, sum(amount_cents)::bigint as c
    from payments where group_id = g and deleted_at is null group by from_user
  ), got as (
    select to_user as user_id, sum(amount_cents)::bigint as c
    from payments where group_id = g and deleted_at is null group by to_user
  ), people as (
    select m.user_id from group_members m where m.group_id = g
  )
  select p.user_id,
         coalesce(paid.c, 0) - coalesce(owed.c, 0) + coalesce(sent.c, 0) - coalesce(got.c, 0)
  from people p
  left join paid using (user_id) left join owed using (user_id)
  left join sent using (user_id) left join got using (user_id)
$$;

-- The payment plan (S-24, D-05): match the biggest debtor with the biggest
-- creditor until everyone is at zero. At most (people - 1) payments.
-- Ties break by user id so the plan is the same on every screen.
create or replace function app.group_plan(g uuid)
returns table (from_user uuid, to_user uuid, amount_cents bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  ids uuid[]; nets bigint[];
  n int; i int; di int; ci int; amt bigint;
begin
  select array_agg(x.user_id order by x.user_id), array_agg(x.net_cents order by x.user_id)
    into ids, nets
  from app.group_nets(g) x where x.net_cents <> 0;
  n := coalesce(array_length(ids, 1), 0);
  loop
    di := null; ci := null;
    for i in 1..n loop
      if nets[i] < 0 and (di is null or nets[i] < nets[di]) then di := i; end if;
      if nets[i] > 0 and (ci is null or nets[i] > nets[ci]) then ci := i; end if;
    end loop;
    exit when di is null or ci is null;
    amt := least(-nets[di], nets[ci]);
    from_user := ids[di]; to_user := ids[ci]; amount_cents := amt;
    return next;
    nets[di] := nets[di] + amt;
    nets[ci] := nets[ci] - amt;
  end loop;
end $$;

-- What the client calls. Membership is checked here because the two
-- functions above are security definer.
create or replace function public.group_balances(g uuid)
returns table (user_id uuid, net_cents bigint)
language sql stable security definer set search_path = public as $$
  select n.* from app.group_nets(g) n where app.is_active() and app.is_member(g)
$$;

create or replace function public.group_plan(g uuid)
returns table (from_user uuid, to_user uuid, amount_cents bigint)
language sql stable security definer set search_path = public as $$
  select p.* from app.group_plan(g) p where app.is_active() and app.is_member(g)
$$;

-- Your net with each friend, summed from plan lines of groups you share
-- (S-02 + S-24). Positive = they owe you.
create or replace function public.friend_balances()
returns table (friend_id uuid, net_cents bigint)
language sql stable security definer set search_path = public as $$
  with mine as (
    select group_id from group_members where user_id = auth.uid() and left_at is null
  ), lines as (
    select p.* from mine m cross join lateral app.group_plan(m.group_id) p
  ), shared as (
    select distinct gm.user_id as friend_id
    from mine m join group_members gm on gm.group_id = m.group_id
    where gm.user_id <> auth.uid()
  )
  select s.friend_id,
         coalesce(sum(case when l.to_user = auth.uid() then l.amount_cents
                           when l.from_user = auth.uid() then -l.amount_cents end), 0)
  from shared s
  left join lines l on (l.from_user = s.friend_id and l.to_user = auth.uid())
                    or (l.to_user = s.friend_id and l.from_user = auth.uid())
  where app.is_active()
  group by s.friend_id
$$;

-- ================================================================ shares
-- Turns a split into cents per person. Leftover cents go one each to
-- participants in a rotating order seeded by the expense id, so the extra
-- cent doesn't always land on the same person (D-11).
create or replace function app.compute_shares(
  p_expense uuid, p_amount integer, p_method public.split_method,
  p_users uuid[], p_pct integer[], p_exact integer[])
returns table (user_id uuid, percent_bp integer, exact_cents integer, amount_cents integer)
language plpgsql immutable as $$
declare
  n int := coalesce(array_length(p_users, 1), 0);
  total_units int; base int; rem int; i int; start int; k int;
  amounts int[] := array_fill(0, array[n]);
  typed_sum int := 0; blank_idx int := null;
begin
  if n = 0 then raise exception 'split_needs_someone'; end if;
  start := abs(hashtext(p_expense::text)) % n;

  if p_method = 'equal' then
    base := p_amount / n; rem := p_amount - base * n;
    for i in 1..n loop amounts[i] := base; end loop;
    for k in 0..rem - 1 loop i := ((start + k) % n) + 1; amounts[i] := amounts[i] + 1; end loop;

  elsif p_method = 'percent' then
    total_units := (select sum(u) from unnest(p_pct) u);
    if total_units is null or total_units <> 10000 then raise exception 'percent_must_be_100'; end if;
    for i in 1..n loop amounts[i] := (p_amount::bigint * p_pct[i] / 10000)::int; end loop;
    rem := p_amount - (select sum(a) from unnest(amounts) a);
    k := 0;
    while rem > 0 loop                       -- only people above 0% get leftovers
      i := ((start + k) % n) + 1;
      if p_pct[i] > 0 then amounts[i] := amounts[i] + 1; rem := rem - 1; end if;
      k := k + 1;
    end loop;

  else -- exact: the app sends every amount; one blank (null) still gets the rest
    for i in 1..n loop
      if p_exact[i] is null then
        if blank_idx is not null then raise exception 'exact_one_blank_only'; end if;
        blank_idx := i;
      else amounts[i] := p_exact[i]; typed_sum := typed_sum + p_exact[i]; end if;
    end loop;
    if blank_idx is not null then
      if typed_sum > p_amount then raise exception 'exact_over_total'; end if;
      amounts[blank_idx] := p_amount - typed_sum;
    elsif typed_sum <> p_amount then raise exception 'exact_must_add_up';
    end if;
  end if;

  for i in 1..n loop
    user_id := p_users[i];
    percent_bp := case when p_method = 'percent' then p_pct[i] end;
    exact_cents := case when p_method = 'exact' then p_exact[i] end;
    amount_cents := amounts[i];
    return next;
  end loop;
end $$;

-- ================================================================ RPCs
-- One example in full; the rest follow the same shape and are listed with
-- their rules in the doc (3 · Data model, "Write functions").
create or replace function public.create_expense(
  p_group uuid, p_description text, p_amount_cents integer,
  p_category public.category, p_category_picked boolean,
  p_paid_by uuid, p_method public.split_method,
  p_users uuid[], p_pct integer[], p_exact integer[],
  p_spent_on date, p_notes text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_group groups%rowtype;
begin
  if not app.is_active() then raise exception 'account_off'; end if;
  select * into v_group from groups where id = p_group for update;   -- serialize with archive
  if not found or not app.is_member(p_group) then raise exception 'not_in_group'; end if;
  if v_group.archived_at is not null then raise exception 'group_archived'; end if;
  if p_spent_on > current_date then raise exception 'date_in_future'; end if;

  -- payer and everyone in the split must be active members
  if exists (
    select 1 from unnest(array_append(p_users, p_paid_by)) u(id)
    where not exists (select 1 from group_members m join profiles pr on pr.id = m.user_id
                      where m.group_id = p_group and m.user_id = u.id
                        and m.left_at is null and pr.status = 'active'))
  then raise exception 'person_not_available'; end if;

  if array_length(p_users, 1) = 1 and p_users[1] = p_paid_by then
    raise exception 'nobody_owes_anything';
  end if;

  insert into expenses (id, group_id, description, notes, amount_cents, category,
                        category_picked, paid_by, split_method, spent_on, created_by)
  values (v_id, p_group, btrim(p_description), nullif(btrim(p_notes), ''), p_amount_cents,
          p_category, p_category_picked, p_paid_by, p_method, p_spent_on, auth.uid());

  insert into expense_shares (expense_id, user_id, percent_bp, exact_cents, amount_cents)
  select v_id, s.user_id, s.percent_bp, s.exact_cents, s.amount_cents
  from app.compute_shares(v_id, p_amount_cents, p_method, p_users, p_pct, p_exact) s;

  insert into activity (group_id, actor_id, kind, expense_id, detail)
  values (p_group, auth.uid(), 'expense_added', v_id,
          jsonb_build_object('description', btrim(p_description), 'amount_cents', p_amount_cents));

  update groups set last_activity_at = now() where id = p_group;
  perform app.queue_expense_sms(p_group, auth.uid(), p_amount_cents);
  return v_id;
end $$;

-- Batches expense texts: one open row per recipient per group, window
-- fixed at 10 minutes from the first change (spec, Text messages).
create or replace function app.queue_expense_sms(p_group uuid, p_actor uuid, p_amount integer)
returns void
language sql security definer set search_path = public as $$
  insert into sms_outbox (recipient_id, group_id, kind, window_ends_at, payload)
  select m.user_id, p_group, 'expenses', now() + interval '10 minutes',
         jsonb_build_object('count', 1, 'total_cents', p_amount, 'actors', jsonb_build_array(p_actor))
  from group_members m
  join profiles pr on pr.id = m.user_id and pr.status = 'active'
  join profile_settings st on st.user_id = m.user_id
  where m.group_id = p_group and m.left_at is null and m.user_id <> p_actor
    and st.sms_consent_at is not null and st.sms_stopped_at is null and st.sms_expenses
  on conflict (recipient_id, group_id) where status = 'pending' and kind = 'expenses'
  do update set payload = jsonb_build_object(
      'count', (sms_outbox.payload->>'count')::int + 1,
      'total_cents', (sms_outbox.payload->>'total_cents')::int + (excluded.payload->>'total_cents')::int,
      'actors', (sms_outbox.payload->'actors') || (excluded.payload->'actors'))
$$;

-- ================================================================ grants
revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
grant usage on schema app to authenticated;
grant select on all tables in schema public to authenticated;
revoke all on public.sms_outbox from authenticated;

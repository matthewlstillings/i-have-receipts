-- I Have Receipts: the rest of the write functions (build step 5, beta).
-- 0001 had create_expense as the worked example. This file adds every other
-- write the screens need, all with the same shape: check the caller, lock the
-- group, check the rule, write, log activity. Error messages are short codes
-- the app maps to the sentences in the spec.
--
-- Also in this file:
--   * Texts are post-MVP (Matthew, Nov 15): the expense-text queue becomes a
--     no-op and phone numbers become optional.
--   * receipts_app.add_person() for adding friends from the SQL editor (people admin in
--     the app is Phase 2, R-16).
--   * receipts_app.seed_demo() / receipts_app.wipe_demo() for the fake beta data.

-- ================================================================ MVP changes
alter table receipts.profiles alter column phone drop not null;

create or replace function receipts_app.queue_expense_sms(p_group uuid, p_actor uuid, p_amount integer)
returns void language sql as $$ select null::void $$;   -- texts are post-MVP

-- ================================================================ helpers
create or replace function receipts_app.assert_active() returns void
language plpgsql stable security definer set search_path = receipts as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not receipts_app.is_active() then raise exception 'account_off'; end if;
end $$;

-- Locks the group row so archive, leave and money writes can't interleave.
create or replace function receipts_app.lock_group(g uuid, must_be_open boolean default true)
returns receipts.groups
language plpgsql security definer set search_path = receipts as $$
declare v receipts.groups;
begin
  perform receipts_app.assert_active();
  select * into v from groups where id = g for update;
  if not found or not receipts_app.is_member(g) then raise exception 'not_in_group'; end if;
  if must_be_open and v.archived_at is not null then raise exception 'group_archived'; end if;
  return v;
end $$;

create or replace function receipts_app.log(g uuid, k receipts.activity_kind, d jsonb default '{}'::jsonb,
  e uuid default null, p uuid default null, subj uuid default null, vis uuid[] default null)
returns void language sql security definer set search_path = receipts as $$
  insert into activity (group_id, actor_id, kind, expense_id, payment_id, subject_user, detail, visible_to)
  values (g, auth.uid(), k, e, p, subj, coalesce(d, '{}'::jsonb), vis);
  update groups set last_activity_at = now() where id = g;
$$;

create or replace function receipts_app.net_of(g uuid, u uuid) returns bigint
language sql stable security definer set search_path = receipts as $$
  select coalesce((select net_cents from receipts_app.group_nets(g) where user_id = u), 0)
$$;

-- The caller's active partner in a group, or null.
create or replace function receipts_app.partner_of(g uuid, u uuid) returns uuid
language sql stable security definer set search_path = receipts as $$
  select case when user_a = u then user_b else user_a end
  from group_pairs where group_id = g and ended_at is null and u in (user_a, user_b)
$$;

-- Everyone in p_users must be an active account and a current member.
create or replace function receipts_app.assert_available(g uuid, p_users uuid[]) returns void
language plpgsql stable security definer set search_path = receipts as $$
begin
  if exists (
    select 1 from unnest(p_users) u(id)
    where not exists (select 1 from group_members m join profiles pr on pr.id = m.user_id
                      where m.group_id = g and m.user_id = u.id
                        and m.left_at is null and pr.status = 'active'))
  then raise exception 'person_not_available'; end if;
end $$;

-- ================================================================ people
-- Run from the SQL editor after creating the login under Authentication > Users.
create or replace function receipts_app.add_person(p_email text, p_name text, p_admin boolean default false)
returns uuid language plpgsql security definer set search_path = receipts as $$
declare v uuid;
begin
  select id into v from auth.users where lower(email) = lower(btrim(p_email));
  if v is null then raise exception 'Create % under Authentication > Users first', p_email; end if;
  insert into profiles (id, display_name, is_admin) values (v, btrim(p_name), p_admin)
  on conflict (id) do update set display_name = excluded.display_name, is_admin = excluded.is_admin;
  insert into profile_settings (user_id) values (v) on conflict do nothing;
  return v;
end $$;

-- First sign-in (A4): confirm name, optional nickname. Texts are post-MVP.
create or replace function receipts.finish_welcome(p_nickname text)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.assert_active();
  update profiles set nickname = nullif(btrim(p_nickname), '') where id = auth.uid();
  insert into profile_settings (user_id, welcomed_at) values (auth.uid(), now())
  on conflict (user_id) do update set welcomed_at = coalesce(profile_settings.welcomed_at, now());
end $$;

-- G2: the person sets only their nickname. Name, email and portrait are the admin's.
create or replace function receipts.update_my_profile(p_nickname text)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.assert_active();
  update profiles set nickname = nullif(btrim(p_nickname), '') where id = auth.uid();
end $$;

-- ================================================================ groups
create or replace function receipts.create_group(p_name text, p_kind receipts.group_kind, p_members uuid[])
returns uuid language plpgsql security definer set search_path = receipts as $$
declare v uuid := gen_random_uuid(); others uuid[];
begin
  perform receipts_app.assert_active();
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 32 then raise exception 'name_length'; end if;
  select array_agg(distinct x) into others from unnest(p_members) x where x <> auth.uid();
  if coalesce(array_length(others, 1), 0) = 0 then raise exception 'needs_another_member'; end if;
  if exists (select 1 from unnest(others) u(id)
             where not exists (select 1 from profiles where id = u.id and status = 'active'))
  then raise exception 'person_not_available'; end if;

  insert into groups (id, name, kind, created_by) values (v, btrim(p_name), p_kind, auth.uid());
  insert into group_members (group_id, user_id, added_by)
  select v, u, auth.uid() from unnest(array_prepend(auth.uid(), others)) u;
  perform receipts_app.log(v, 'group_created', jsonb_build_object('name', btrim(p_name)));
  perform receipts_app.log(v, 'member_added', '{}'::jsonb, null, null, u) from unnest(others) u;
  return v;
end $$;

create or replace function receipts.update_group(g uuid, p_name text, p_kind receipts.group_kind)
returns void language plpgsql security definer set search_path = receipts as $$
declare old receipts.groups;
begin
  old := receipts_app.lock_group(g);
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 32 then raise exception 'name_length'; end if;
  if old.name = btrim(p_name) and old.kind = p_kind then return; end if;
  update groups set name = btrim(p_name), kind = p_kind where id = g;
  perform receipts_app.log(g, 'group_edited', jsonb_build_object(
    'before', jsonb_build_object('name', old.name, 'kind', old.kind),
    'after',  jsonb_build_object('name', btrim(p_name), 'kind', p_kind)));
end $$;

create or replace function receipts.add_members(g uuid, p_users uuid[])
returns void language plpgsql security definer set search_path = receipts as $$
declare u uuid;
begin
  perform receipts_app.lock_group(g);
  foreach u in array coalesce(p_users, '{}') loop
    if not exists (select 1 from profiles where id = u and status = 'active') then
      raise exception 'person_not_available'; end if;
    if exists (select 1 from group_members where group_id = g and user_id = u and left_at is null) then
      continue; end if;
    insert into group_members (group_id, user_id, added_by) values (g, u, auth.uid())
    on conflict (group_id, user_id) do update set left_at = null, joined_at = now(), added_by = auth.uid();
    perform receipts_app.log(g, 'member_added', '{}'::jsonb, null, null, u);
  end loop;
end $$;

create or replace function receipts.leave_group(g uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare net bigint; p uuid;
begin
  perform receipts_app.lock_group(g, false);
  p := receipts_app.partner_of(g, auth.uid());
  if p is not null then raise exception 'unlink_first'; end if;
  net := receipts_app.net_of(g, auth.uid());
  if net <> 0 then raise exception 'settle_first:%', abs(net); end if;
  if (select count(*) from group_members where group_id = g and left_at is null) <= 1 then
    raise exception 'last_member'; end if;
  update group_members set left_at = now() where group_id = g and user_id = auth.uid();
  perform receipts_app.log(g, 'member_left', '{}'::jsonb, null, null, auth.uid());
end $$;

create or replace function receipts.archive_group(g uuid)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.lock_group(g);
  if exists (select 1 from receipts_app.group_nets(g) where net_cents <> 0) then raise exception 'not_settled'; end if;
  update groups set archived_at = now(), archived_by = auth.uid() where id = g;
  perform receipts_app.log(g, 'group_archived');
end $$;

create or replace function receipts.reopen_group(g uuid)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.lock_group(g, false);
  update groups set archived_at = null, archived_by = null where id = g;
  perform receipts_app.log(g, 'group_reopened');
end $$;

create or replace function receipts.delete_group(g uuid)
returns void language plpgsql security definer set search_path = receipts as $$
begin
  perform receipts_app.lock_group(g, false);
  if exists (select 1 from expenses where group_id = g and deleted_at is null)
     or exists (select 1 from payments where group_id = g and deleted_at is null)
  then raise exception 'group_has_money'; end if;
  delete from groups where id = g;
end $$;

-- ================================================================ pairs
create or replace function receipts.link_partner(g uuid, p_other uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare a uuid; b uuid;
begin
  perform receipts_app.lock_group(g);
  if p_other = auth.uid() then raise exception 'pair_self'; end if;
  if not exists (select 1 from group_members where group_id = g and user_id = p_other and left_at is null)
  then raise exception 'person_not_available'; end if;
  if receipts_app.partner_of(g, auth.uid()) is not null or receipts_app.partner_of(g, p_other) is not null then
    raise exception 'already_paired'; end if;
  a := least(auth.uid(), p_other); b := greatest(auth.uid(), p_other);
  insert into group_pairs (group_id, user_a, user_b, linked_by) values (g, a, b, auth.uid());
  perform receipts_app.log(g, 'pair_linked', '{}'::jsonb, null, null, p_other, array[a, b]);
end $$;

create or replace function receipts.unlink_partner(g uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare p uuid;
begin
  perform receipts_app.lock_group(g, false);
  p := receipts_app.partner_of(g, auth.uid());
  if p is null then return; end if;
  update group_pairs set ended_at = now()
  where group_id = g and ended_at is null and auth.uid() in (user_a, user_b);
  perform receipts_app.log(g, 'pair_unlinked', '{}'::jsonb, null, null, p, array[auth.uid(), p]);
end $$;

-- ================================================================ expenses
create or replace function receipts.update_expense(
  p_id uuid, p_version integer, p_description text, p_amount_cents integer,
  p_category receipts.category, p_category_picked boolean,
  p_paid_by uuid, p_method receipts.split_method,
  p_users uuid[], p_pct integer[], p_exact integer[],
  p_spent_on date, p_notes text)
returns integer   -- the new version
language plpgsql security definer set search_path = receipts as $$
declare old receipts.expenses; before jsonb; after jsonb; new_people uuid[];
begin
  select * into old from expenses where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform receipts_app.lock_group(old.group_id);
  select * into old from expenses where id = p_id for update;
  if old.deleted_at is not null then raise exception 'expense_deleted'; end if;
  if old.version <> p_version then
    raise exception 'version_conflict:%', coalesce((select display_name from profiles where id = old.updated_by), '');
  end if;
  if p_spent_on > current_date then raise exception 'date_in_future'; end if;
  if array_length(p_users, 1) = 1 and p_users[1] = p_paid_by then raise exception 'nobody_owes_anything'; end if;

  -- People already on this expense may stay even if they left or were turned
  -- off (S-04). Anyone new must be available.
  select array_agg(u) into new_people from unnest(array_append(p_users, p_paid_by)) u
  where u <> old.paid_by and not exists (select 1 from expense_shares s where s.expense_id = p_id and s.user_id = u);
  if new_people is not null then perform receipts_app.assert_available(old.group_id, new_people); end if;

  before := jsonb_build_object('description', old.description, 'amount_cents', old.amount_cents,
    'category', old.category, 'paid_by', old.paid_by, 'split_method', old.split_method,
    'spent_on', old.spent_on, 'notes', old.notes,
    'shares', (select jsonb_object_agg(user_id, amount_cents) from expense_shares where expense_id = p_id));

  update expenses set description = btrim(p_description), notes = nullif(btrim(p_notes), ''),
    amount_cents = p_amount_cents, category = p_category, category_picked = p_category_picked,
    paid_by = p_paid_by, split_method = p_method, spent_on = p_spent_on,
    version = version + 1, updated_by = auth.uid(), updated_at = now()
  where id = p_id;
  delete from expense_shares where expense_id = p_id;
  insert into expense_shares (expense_id, user_id, percent_bp, exact_cents, amount_cents)
  select p_id, s.user_id, s.percent_bp, s.exact_cents, s.amount_cents
  from receipts_app.compute_shares(p_id, p_amount_cents, p_method, p_users, p_pct, p_exact) s;

  after := jsonb_build_object('description', btrim(p_description), 'amount_cents', p_amount_cents,
    'category', p_category, 'paid_by', p_paid_by, 'split_method', p_method,
    'spent_on', p_spent_on, 'notes', nullif(btrim(p_notes), ''),
    'shares', (select jsonb_object_agg(user_id, amount_cents) from expense_shares where expense_id = p_id));
  perform receipts_app.log(old.group_id, 'expense_edited', jsonb_build_object('before', before, 'after', after), p_id);
  return old.version + 1;
end $$;

create or replace function receipts.delete_expense(p_id uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare e receipts.expenses;
begin
  select * into e from expenses where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform receipts_app.lock_group(e.group_id);
  if e.deleted_at is not null then return; end if;
  update expenses set deleted_at = now(), deleted_by = auth.uid(), version = version + 1 where id = p_id;
  perform receipts_app.log(e.group_id, 'expense_deleted',
    jsonb_build_object('description', e.description, 'amount_cents', e.amount_cents), p_id);
end $$;

create or replace function receipts.restore_expense(p_id uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare e receipts.expenses;
begin
  select * into e from expenses where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform receipts_app.lock_group(e.group_id);
  if e.deleted_at is null then return; end if;
  update expenses set deleted_at = null, deleted_by = null, version = version + 1 where id = p_id;
  perform receipts_app.log(e.group_id, 'expense_restored',
    jsonb_build_object('description', e.description, 'amount_cents', e.amount_cents), p_id);
end $$;

-- ================================================================ payments
-- The payer or the person paid can record. A linked partner can record the
-- other partner's payment ("Settle for both of us", S-23).
create or replace function receipts_app.may_record(g uuid, p_from uuid, p_to uuid) returns boolean
language sql stable security definer set search_path = receipts as $$
  select coalesce(auth.uid() in (p_from, p_to)
      or receipts_app.partner_of(g, auth.uid()) in (p_from, p_to), false)
$$;

create or replace function receipts.record_payment(g uuid, p_from uuid, p_to uuid, p_amount_cents integer, p_paid_on date default current_date)
returns uuid language plpgsql security definer set search_path = receipts as $$
declare v uuid := gen_random_uuid();
begin
  perform receipts_app.lock_group(g);
  if p_from = p_to then raise exception 'same_person'; end if;
  if not receipts_app.may_record(g, p_from, p_to) then raise exception 'not_your_payment'; end if;
  if p_amount_cents not between 1 and 9999999 then raise exception 'amount_range'; end if;
  if p_paid_on > current_date then raise exception 'date_in_future'; end if;
  -- Turned-off or departed members can still be paid (S-04), so only
  -- membership at some point is required.
  if (select count(*) from group_members where group_id = g and user_id in (p_from, p_to)) <> 2 then
    raise exception 'person_not_available'; end if;
  insert into payments (id, group_id, from_user, to_user, amount_cents, paid_on, created_by)
  values (v, g, p_from, p_to, p_amount_cents, p_paid_on, auth.uid());
  perform receipts_app.log(g, 'payment_added', jsonb_build_object('from', p_from, 'to', p_to, 'amount_cents', p_amount_cents), null, v);
  return v;
end $$;

create or replace function receipts.update_payment(p_id uuid, p_version integer, p_amount_cents integer, p_paid_on date)
returns integer language plpgsql security definer set search_path = receipts as $$
declare p receipts.payments;
begin
  select * into p from payments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform receipts_app.lock_group(p.group_id);
  if not receipts_app.may_record(p.group_id, p.from_user, p.to_user) then raise exception 'not_your_payment'; end if;
  if p.version <> p_version then raise exception 'version_conflict:'; end if;
  if p_amount_cents not between 1 and 9999999 then raise exception 'amount_range'; end if;
  if p_paid_on > current_date then raise exception 'date_in_future'; end if;
  update payments set amount_cents = p_amount_cents, paid_on = p_paid_on, version = version + 1,
    updated_by = auth.uid(), updated_at = now() where id = p_id;
  perform receipts_app.log(p.group_id, 'payment_edited', jsonb_build_object(
    'from', p.from_user, 'to', p.to_user,
    'before', jsonb_build_object('amount_cents', p.amount_cents, 'paid_on', p.paid_on),
    'after',  jsonb_build_object('amount_cents', p_amount_cents, 'paid_on', p_paid_on)), null, p_id);
  return p.version + 1;
end $$;

create or replace function receipts.delete_payment(p_id uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare p receipts.payments;
begin
  select * into p from payments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform receipts_app.lock_group(p.group_id);
  if not receipts_app.may_record(p.group_id, p.from_user, p.to_user) then raise exception 'not_your_payment'; end if;
  if p.deleted_at is not null then return; end if;
  update payments set deleted_at = now(), deleted_by = auth.uid(), version = version + 1 where id = p_id;
  perform receipts_app.log(p.group_id, 'payment_deleted',
    jsonb_build_object('from', p.from_user, 'to', p.to_user, 'amount_cents', p.amount_cents), null, p_id);
end $$;

create or replace function receipts.restore_payment(p_id uuid)
returns void language plpgsql security definer set search_path = receipts as $$
declare p receipts.payments;
begin
  select * into p from payments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform receipts_app.lock_group(p.group_id);
  if not receipts_app.may_record(p.group_id, p.from_user, p.to_user) then raise exception 'not_your_payment'; end if;
  update payments set deleted_at = null, deleted_by = null, version = version + 1 where id = p_id;
  perform receipts_app.log(p.group_id, 'payment_added',
    jsonb_build_object('from', p.from_user, 'to', p.to_user, 'amount_cents', p.amount_cents, 'restored', true), null, p_id);
end $$;

-- The signed-in person's own email (A4, Account). Others' emails stay hidden.
create or replace function receipts.my_email() returns text
language sql stable security definer set search_path = receipts as $$
  select email from auth.users where id = auth.uid() and receipts_app.is_active()
$$;

-- ================================================================ grants
revoke execute on all functions in schema receipts_app from public, anon, authenticated;
grant execute on function receipts_app.me(), receipts_app.is_active(), receipts_app.is_member(uuid), receipts_app.is_admin() to authenticated;
revoke execute on function receipts_app.add_person(text, text, boolean) from authenticated;

-- The app calls these through the API as the signed-in user.
revoke execute on all functions in schema receipts from public, anon;
grant execute on all functions in schema receipts to authenticated, service_role;

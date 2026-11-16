-- Fake beta data. Run in the Supabase SQL editor AFTER the migrations and
-- after you've added yourself with app.add_person(...).
--
--   select app.seed_demo();   -- adds 5 fake friends + 5 groups with expenses
--   select app.wipe_demo();   -- deletes every group and the fake friends
--
-- Real people already in profiles are added to the demo groups too, so
-- friends who sign in see the same fake groups. Fake friends use
-- @demo.invalid emails and can't sign in.

create or replace function app.act_as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', u)::text, true);
$$;

create or replace function app.fake_person(p_key text, p_name text) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare v uuid; e text := 'demo+' || p_key || '@demo.invalid';
begin
  select id into v from auth.users where email = e;
  if v is null then
    v := gen_random_uuid();
    insert into auth.users (id, email, aud, role, created_at, updated_at)
    values (v, e, 'authenticated', 'authenticated', now(), now());
  end if;
  insert into profiles (id, display_name) values (v, p_name) on conflict (id) do nothing;
  insert into profile_settings (user_id, welcomed_at) values (v, now()) on conflict do nothing;
  return v;
end $$;

create or replace function app.seed_demo() returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid; real_people uuid[];
  rio uuid; priya uuid; sam uuid; jo uuid; dana uuid;
  g_supper uuid; g_apt uuid; g_bday uuid; g_cats uuid; g_beach uuid;
  e uuid; everyone uuid[];
  d date := current_date;
begin
  select id into me from profiles where is_admin and status = 'active' order by created_at limit 1;
  if me is null then raise exception 'Add yourself first: select app.add_person(''you@email.com'', ''Your N.'', true);'; end if;
  select array_agg(id) into real_people from profiles
   where status = 'active' and id <> me and id not in (select id from auth.users where email like '%@demo.invalid');
  real_people := coalesce(real_people, '{}');

  rio   := app.fake_person('rio',   'Rio M.');
  priya := app.fake_person('priya', 'Priya L.');
  sam   := app.fake_person('sam',   'Sam T.');
  jo    := app.fake_person('jo',    'Jo P.');
  dana  := app.fake_person('dana',  'Dana K.');

  perform app.act_as(me);

  -- Supper Club: you're owed
  g_supper := public.create_group('Supper Club', 'other', array[rio, priya, sam, jo] || real_people);
  everyone := array[me, rio, priya, sam, jo] || real_people;
  perform public.create_expense(g_supper, 'Tacos at Los Mariscos', 18640, 'food', false, me, 'equal', everyone, null, null, d, null);
  perform public.create_expense(g_supper, 'Wine for the table', 7200, 'food', false, priya, 'equal', everyone, null, null, d - 6, null);
  perform app.act_as(sam);
  perform public.create_expense(g_supper, 'Uber to the airport', 6200, 'transport', false, sam, 'equal', array[me, sam, jo], null, null, d, null);
  perform public.create_expense(g_supper, 'Movie night', 6400, 'entertainment', false, sam, 'percent',
                                array[me, rio, priya, sam], array[4000, 2000, 2000, 2000], null, d - 9, 'Popcorn included');
  perform app.act_as(jo);
  perform public.record_payment(g_supper, jo, me, 1200, d - 3);

  -- Apartment 4B: you owe
  perform app.act_as(priya);
  g_apt := public.create_group('Apartment 4B', 'home', array[me, sam]);
  perform public.create_expense(g_apt, 'October rent', 240000, 'home', true, priya, 'equal', array[me, priya, sam], null, null, d - 14, null);
  perform app.act_as(sam);
  perform public.create_expense(g_apt, 'Con Ed', 9600, 'utilities', false, sam, 'equal', array[me, priya, sam], null, null, d - 18, null);
  perform app.act_as(me);
  perform public.create_expense(g_apt, 'Internet', 6000, 'utilities', false, me, 'exact', array[me, priya, sam], null, array[2000, 2000, null], d - 18, null);

  -- Jo's birthday: gift for Jo, Jo not in the split
  perform app.act_as(me);
  g_bday := public.create_group('Jo''s birthday', 'other', array[rio, dana, jo]);
  perform public.create_expense(g_bday, 'Cake from Lady M', 9600, 'food', false, me, 'equal', array[me, rio, dana], null, null, d - 2, null);
  perform app.act_as(rio);
  perform public.link_partner(g_bday, dana);

  -- Catskills weekend: settled
  perform app.act_as(sam);
  g_cats := public.create_group('Catskills weekend', 'trip', array[me, rio, priya, jo] || real_people);
  perform public.create_expense(g_cats, 'Cabin rental', 100000, 'home', false, sam, 'equal', array[me, rio, priya, jo, sam], null, null, d - 30, null);
  perform app.act_as(me);  perform public.record_payment(g_cats, me, sam, 20000, d - 25);
  perform app.act_as(rio); perform public.record_payment(g_cats, rio, sam, 20000, d - 25);
  perform app.act_as(priya); perform public.record_payment(g_cats, priya, sam, 20000, d - 24);
  perform app.act_as(jo);  perform public.record_payment(g_cats, jo, sam, 20000, d - 24);

  -- Beach house: settled and archived
  perform app.act_as(rio);
  g_beach := public.create_group('Beach house 2025', 'trip', array[me, priya]);
  perform public.create_expense(g_beach, 'Groceries', 9000, 'food', false, rio, 'equal', array[me, rio, priya], null, null, d - 120, null);
  perform app.act_as(me);    perform public.record_payment(g_beach, me, rio, 3000, d - 110);
  perform app.act_as(priya); perform public.record_payment(g_beach, priya, rio, 3000, d - 110);
  perform public.archive_group(g_beach);

  perform set_config('request.jwt.claim.sub', '', true);
  return 'Seeded 5 groups.';
end $$;

create or replace function app.wipe_demo() returns text
language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  delete from activity;  -- activity rows point at profiles; clear before groups
  delete from groups;
  get diagnostics n = row_count;
  delete from profile_settings where user_id in (select id from auth.users where email like '%@demo.invalid');
  delete from profiles where id in (select id from auth.users where email like '%@demo.invalid');
  delete from auth.users where email like '%@demo.invalid';
  return 'Deleted ' || n || ' groups and the fake friends.';
end $$;

revoke execute on function app.seed_demo(), app.wipe_demo(), app.fake_person(text, text), app.act_as(uuid) from public, authenticated;

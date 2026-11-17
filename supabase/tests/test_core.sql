\set ON_ERROR_STOP on
-- Checks for 0003_core_people.sql: shared people, per-app access.
set search_path = receipts, public;
insert into core.apps (key, name) values ('project_b', 'Project B');
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','matt@x.com'),
 ('00000000-0000-0000-0000-00000000000b','a@x.com'),   -- Friend A: Receipts + Project B
 ('00000000-0000-0000-0000-00000000000c','b@x.com'),   -- Friend B: Project B only
 ('00000000-0000-0000-0000-00000000000d','c@x.com');   -- Friend C: Receipts only
select core.add_person('matt@x.com','Matthew L.', array['receipts','project_b'], true);
select core.add_person('a@x.com','Ana A.', array['receipts','project_b']);
select core.add_person('b@x.com','Ben B.', array['project_b']);
select core.add_person('c@x.com','Cy C.', array['receipts']);

set role authenticated;
\echo '--- 1. Friend B (Project B only) is not in Receipts and sees no Receipts people'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select core.has_app('receipts') as b_has_receipts, core.has_app('project_b') as b_has_project_b;
select count(*) as b_sees_receipts_profiles from receipts.profiles;
select string_agg(display_name, ', ' order by display_name) as b_sees_people from core.people;

\echo '--- 2. Friend C (Receipts only) sees Receipts people, not Ben'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);
select string_agg(display_name, ', ' order by display_name) as c_sees_receipts_people from receipts.profiles;
select string_agg(display_name, ', ' order by display_name) as c_sees_people from core.people;

\echo '--- 3. Friend C can make a Receipts group with Ana, but not with Ben'
select receipts.create_group('Dinner', 'other', array['00000000-0000-0000-0000-00000000000b']::uuid[]) is not null as made_group;
do $$ begin
  perform receipts.create_group('Nope', 'other', array['00000000-0000-0000-0000-00000000000c']::uuid[]);
  raise exception 'FAIL: Ben was added to a Receipts group';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: Ben refused -> %', sqlerrm;
end $$;

\echo '--- 4. Revoking Receipts from Ana: she is out, but her name stays on old groups (shown as off)'
reset role;
select core.revoke_app('a@x.com', 'receipts');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false);
select core.has_app('receipts') as ana_has_receipts, core.has_app('project_b') as ana_has_project_b;
select count(*) as ana_sees_receipts_groups from receipts.groups;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);
select display_name, status from receipts.profiles order by display_name;

\echo '--- 5. Nickname is shared across apps'
select receipts.update_my_profile('Cyclone');
select nickname from core.people where id = '00000000-0000-0000-0000-00000000000d';

\echo '--- 6. Users cannot grant themselves apps'
do $$ begin
  perform core.grant_app('c@x.com', 'project_b');
  raise exception 'FAIL: user granted an app';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: grant refused -> %', sqlerrm;
end $$;
\echo 'ALL CORE TESTS RAN'

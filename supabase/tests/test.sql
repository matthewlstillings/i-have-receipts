\set ON_ERROR_STOP on
-- People: Matt (admin), Rio, Priya, Sam, Jo, Dana, Out (outsider)
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','matt@x.com'),
 ('00000000-0000-0000-0000-00000000000b','rio@x.com'),
 ('00000000-0000-0000-0000-00000000000c','priya@x.com'),
 ('00000000-0000-0000-0000-00000000000d','sam@x.com'),
 ('00000000-0000-0000-0000-00000000000e','out@x.com');
insert into profiles (id, display_name, phone, is_admin) values
 ('00000000-0000-0000-0000-00000000000a','Matthew L.','+12125550101', true),
 ('00000000-0000-0000-0000-00000000000b','Rio M.','+12125550102', false),
 ('00000000-0000-0000-0000-00000000000c','Priya L.','+12125550103', false),
 ('00000000-0000-0000-0000-00000000000d','Sam T.','+12125550104', false),
 ('00000000-0000-0000-0000-00000000000e','Out S.','+12125550105', false);
insert into profile_settings (user_id, sms_consent_at)
 select id, now() from profiles;

insert into groups (id, name, kind, created_by) values
 ('10000000-0000-0000-0000-000000000001','Supper Club','other','00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000002','Secret','home','00000000-0000-0000-0000-00000000000e');
insert into group_members (group_id, user_id) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000e'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000b');

-- Act as Matt
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);

\echo '--- 1. $100 split equally among 3: cents must sum to 10000, spread 3334/3333/3333'
select public.create_expense('10000000-0000-0000-0000-000000000001','Tacos',10000,'food',false,
  '00000000-0000-0000-0000-00000000000a','equal',
  array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[],
  null,null,current_date,null) as tacos \gset
select sum(amount_cents) as total, array_agg(amount_cents order by amount_cents desc) from expense_shares where expense_id = :'tacos';

\echo '--- 2. Percent 40/20/20/20 of $300 by Rio: 12000/6000/6000/6000'
select public.create_expense('10000000-0000-0000-0000-000000000001','Cabin',30000,'home',true,
  '00000000-0000-0000-0000-00000000000b','percent',
  array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d']::uuid[],
  array[4000,2000,2000,2000],null,current_date,null) as cabin \gset
select array_agg(amount_cents order by amount_cents desc) from expense_shares where expense_id = :'cabin';

\echo '--- 3. Exact with one blank: 5000 + blank on $123.45 -> 5000 / 7345'
select public.create_expense('10000000-0000-0000-0000-000000000001','Gas',12345,'transport',false,
  '00000000-0000-0000-0000-00000000000d','exact',
  array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000d']::uuid[],
  null,array[5000,null],current_date,null) as gas \gset
select array_agg(amount_cents order by amount_cents) from expense_shares where expense_id = :'gas';

\echo '--- 4. Balances sum to zero; plan has at most n-1 lines and clears every balance'
select sum(net_cents) as must_be_zero from public.group_balances('10000000-0000-0000-0000-000000000001');
select * from public.group_balances('10000000-0000-0000-0000-000000000001') order by user_id;
select * from public.group_plan('10000000-0000-0000-0000-000000000001');
with p as (select * from public.group_plan('10000000-0000-0000-0000-000000000001')),
 b as (select user_id, net_cents
         + coalesce((select sum(amount_cents) from p where p.from_user = user_id),0)
         - coalesce((select sum(amount_cents) from p where p.to_user = user_id),0) as after
       from public.group_balances('10000000-0000-0000-0000-000000000001'))
select bool_and(after = 0) as plan_clears_everyone from b;

\echo '--- 5. Friend balances for Matt'
select * from public.friend_balances() order by friend_id;

\echo '--- 6. Privacy: Matt cannot see the Secret group or its balances'
select count(*) as secret_groups_visible from groups where id = '10000000-0000-0000-0000-000000000002';
select count(*) as secret_balance_rows from public.group_balances('10000000-0000-0000-0000-000000000002');
select count(*) as outsider_profile_visible from profiles;  -- directory is visible: 5

\echo '--- 7. Direct writes are blocked'
do $$ begin
  insert into expenses (group_id, description, amount_cents, paid_by, spent_on, created_by)
  values ('10000000-0000-0000-0000-000000000001','x',1,'00000000-0000-0000-0000-00000000000a',current_date,'00000000-0000-0000-0000-00000000000a');
  raise exception 'FAIL: direct insert allowed';
exception when insufficient_privilege then raise notice 'ok: direct insert refused';
end $$;

\echo '--- 8. Rules: future date, nobody owes, over-total exact'
do $$ begin
  perform public.create_expense('10000000-0000-0000-0000-000000000001','x',100,'food',false,
    '00000000-0000-0000-0000-00000000000a','equal',array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[],null,null,current_date+1,null);
  raise exception 'FAIL';
exception when others then raise notice 'ok: %', sqlerrm; end $$;
do $$ begin
  perform public.create_expense('10000000-0000-0000-0000-000000000001','x',100,'food',false,
    '00000000-0000-0000-0000-00000000000a','equal',array['00000000-0000-0000-0000-00000000000a']::uuid[],null,null,current_date,null);
  raise exception 'FAIL';
exception when others then raise notice 'ok: %', sqlerrm; end $$;
do $$ begin
  perform public.create_expense('10000000-0000-0000-0000-000000000001','x',100,'food',false,
    '00000000-0000-0000-0000-00000000000a','exact',array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[],null,array[90,null],current_date,null);
  perform public.create_expense('10000000-0000-0000-0000-000000000001','x',100,'food',false,
    '00000000-0000-0000-0000-00000000000a','exact',array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[],null,array[150,null],current_date,null);
  raise exception 'FAIL';
exception when others then raise notice 'ok: %', sqlerrm; end $$;

\echo '--- 8b. Percent not adding to 100 is refused'
do $$ begin
  perform public.create_expense('10000000-0000-0000-0000-000000000001','x',100,'food',false,
    '00000000-0000-0000-0000-00000000000a','percent',array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b']::uuid[],array[5000,4000],null,current_date,null);
  raise exception 'FAIL';
exception when others then raise notice 'ok: %', sqlerrm; end $$;

\echo '--- 9. Texts are post-MVP: the queue stays empty (0002)'
reset role;
select recipient_id, payload from sms_outbox order by recipient_id;

\echo '--- 10. Turned-off account sees nothing'
update profiles set status = 'off' where id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false);
select count(*) as rio_sees_groups from groups;
select count(*) as rio_sees_profiles from profiles;
\echo 'ALL TESTS RAN'

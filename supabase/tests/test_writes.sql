set search_path = receipts, public;
\set ON_ERROR_STOP on
-- Checks for 0002_write_functions.sql. Run after stubs + both migrations.
-- People: A (Matt), B (Rio), C (Priya), D (Sam), E (outsider)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','matt@x.com'),
 ('00000000-0000-0000-0000-00000000000b','rio@x.com'),
 ('00000000-0000-0000-0000-00000000000c','priya@x.com'),
 ('00000000-0000-0000-0000-00000000000d','sam@x.com'),
 ('00000000-0000-0000-0000-00000000000e','out@x.com');
select receipts_app.add_person('matt@x.com','Matthew L.',true), receipts_app.add_person('rio@x.com','Rio M.'),
       receipts_app.add_person('priya@x.com','Priya L.'), receipts_app.add_person('sam@x.com','Sam T.'), receipts_app.add_person('out@x.com','Out S.');

create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: expected % but it succeeded: %', code, sql;
exception when others then
  if sqlerrm like 'FAIL:%' or position(code in sqlerrm) = 0 then raise; end if;
  raise notice 'ok: % -> %', left(sql, 60), sqlerrm;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);

\echo '--- 1. Create group needs another member and a 1-32 char name'
select pg_temp.expect_error($$select receipts.create_group('Solo','other',array['00000000-0000-0000-0000-00000000000a']::uuid[])$$, 'needs_another_member');
select pg_temp.expect_error($$select receipts.create_group('   ','other',array['00000000-0000-0000-0000-00000000000b']::uuid[])$$, 'name_length');
select receipts.create_group('Supper Club','other',
  array['00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000d']::uuid[]) as g \gset
select count(*) as members from group_members where group_id = :'g';

\echo '--- 2. Expense, then edit with the right version, then a stale edit is refused'
select receipts.create_expense(:'g','Tacos',9000,'food',false,'00000000-0000-0000-0000-00000000000a','equal',
  array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[],
  null,null,current_date,null) as e \gset
select receipts.update_expense(:'e', 1, 'Tacos', 12000, 'food', false, '00000000-0000-0000-0000-00000000000a', 'equal',
  array['00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000c']::uuid[],
  null, null, current_date, null) as v2;
select pg_temp.expect_error(format($$select receipts.update_expense(%L, 1, 'Tacos', 100, 'food', false, '00000000-0000-0000-0000-00000000000a', 'equal',
  array['00000000-0000-0000-0000-00000000000b']::uuid[], null, null, current_date, null)$$, :'e'), 'version_conflict');
select amount_cents from expenses where id = :'e';
select detail->'before'->>'amount_cents' as before, detail->'after'->>'amount_cents' as after
  from activity where kind = 'expense_edited';

\echo '--- 3. Rio cannot leave owing; Sam (not in the split, $0) can'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_error(format($$select receipts.leave_group(%L)$$, :'g'), 'settle_first:4000');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000d', false);
select receipts.leave_group(:'g');
select count(*) as sam_sees_group_after_leaving from groups where id = :'g';

\echo '--- 4. Archive refused while unsettled; delete refused with money'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_error(format($$select receipts.archive_group(%L)$$, :'g'), 'not_settled');
select pg_temp.expect_error(format($$select receipts.delete_group(%L)$$, :'g'), 'group_has_money');

\echo '--- 5. Payments: outsider-to-the-payment refused, the payer can record'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect_error(format($$select receipts.record_payment(%L,'00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',4000)$$, :'g'), 'not_your_payment');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false);
select receipts.record_payment(:'g','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a',4000) as pay \gset

\echo '--- 6. Linked partner can record for both (Priya links with Rio, records her own and sees plan)'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select receipts.link_partner(:'g','00000000-0000-0000-0000-00000000000b');
select count(*) as priya_sees_pair from group_pairs;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select count(*) as matt_sees_pair from group_pairs;
select count(*) as matt_sees_pair_activity from activity where kind = 'pair_linked';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b', false);
select receipts.record_payment(:'g','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000a',4000);
select user_id, net_cents from receipts.group_balances(:'g') order by user_id;

\echo '--- 7. Leaving while linked is refused'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect_error(format($$select receipts.leave_group(%L)$$, :'g'), 'unlink_first');
select receipts.unlink_partner(:'g');

\echo '--- 8. Settled: archive, then writes are refused, then reopen'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a', false);
select receipts.archive_group(:'g');
select pg_temp.expect_error(format($$select receipts.delete_expense(%L)$$, :'e'), 'group_archived');
select receipts.reopen_group(:'g');

\echo '--- 9. Delete and restore an expense'
select receipts.delete_expense(:'e');
select count(*) as nets_nonzero_after_delete from receipts.group_balances(:'g') where net_cents <> 0;
select receipts.restore_expense(:'e');
select count(*) as nets_nonzero_after_restore from receipts.group_balances(:'g') where net_cents <> 0;

\echo '--- 10. Outsider cannot touch the group'
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000e', false);
select pg_temp.expect_error(format($$select receipts.add_members(%L, array['00000000-0000-0000-0000-00000000000e']::uuid[])$$, :'g'), 'not_in_group');

\echo '--- 11. Nickname and welcome; add_person is not callable by users'
select receipts.finish_welcome('Outie');
select nickname from profiles where id = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect_error($$select receipts_app.add_person('x@x.com','X Y.')$$, 'permission denied');
\echo 'ALL WRITE TESTS RAN'

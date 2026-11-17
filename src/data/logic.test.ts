// Checks the TypeScript ports against the same cases the SQL tests use.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeShares, groupNets, groupPlan, guessCategory, guessKind, parseCents } from './logic.ts'

test('$100 split equally among 3 adds up, one extra cent', () => {
  const s = computeShares('x', 10000, 'equal', ['a', 'b', 'c'], null, null)
  assert.equal(s.reduce((t, r) => t + r.amount_cents, 0), 10000)
  assert.deepEqual(s.map((r) => r.amount_cents).sort(), [3333, 3333, 3334])
})
test('percent 40/20/20/20 of $300', () => {
  const s = computeShares('x', 30000, 'percent', ['a', 'b', 'c', 'd'], [4000, 2000, 2000, 2000], null)
  assert.deepEqual(s.map((r) => r.amount_cents), [12000, 6000, 6000, 6000])
})
test('percent must total 100', () => assert.throws(() => computeShares('x', 100, 'percent', ['a', 'b'], [5000, 4000], null), /percent_must_be_100/))
test('exact with one blank gets the rest', () => {
  const s = computeShares('x', 6000, 'exact', ['a', 'b', 'c'], null, [2000, 2000, null])
  assert.deepEqual(s.map((r) => r.amount_cents), [2000, 2000, 2000])
})
test('plan settles everyone in at most n-1 payments', () => {
  const L = {
    members: ['a', 'b', 'c', 'd'].map((u) => ({ group_id: 'g', user_id: u })),
    expenses: [{ id: 'e', group_id: 'g', paid_by: 'a', amount_cents: 9000, deleted_at: null } as any],
    shares: computeShares('e', 9000, 'equal', ['a', 'b', 'c'], null, null),
    payments: [],
  }
  const nets = groupNets(L, 'g')
  assert.equal([...nets.values()].reduce((a, b) => a + b, 0), 0)
  const plan = groupPlan(nets)
  assert.ok(plan.length <= 3)
  for (const l of plan) { nets.set(l.from, nets.get(l.from)! + l.amount); nets.set(l.to, nets.get(l.to)! - l.amount) }
  assert.ok([...nets.values()].every((v) => v === 0))
})
test('guesses', () => {
  assert.equal(guessCategory('Tacos at Los Mariscos'), 'food')
  assert.equal(guessCategory('Uber to the airport'), 'transport')
  assert.equal(guessCategory('Con Ed'), 'utilities')
  assert.equal(guessCategory('October rent'), 'home')
  assert.equal(guessCategory('Movie night'), 'entertainment')
  assert.equal(guessCategory('Zxqv'), 'uncategorized')
  assert.equal(guessKind('Catskills weekend'), 'trip')
  assert.equal(guessKind('Apartment 4B'), 'home')
  assert.equal(parseCents('86.5'), 8650)
  assert.equal(parseCents('1,234.05'), 123405)
  assert.equal(parseCents('abc'), null)
})

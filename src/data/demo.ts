// Demo backend: the whole database in the browser, with the same rules as the
// SQL write functions in 0002_write_functions.sql. Used when no Supabase keys
// are set, so the beta can be clicked through before the backend exists.
// Data is saved in this browser only; "Reset demo data" on Account restores it.
import type { Activity, ActivityKind, Backend, Expense, ExpenseInput, Group, GroupKind, Member, Pair, Payment, Profile, Share, Snapshot } from './types.ts'
import { AppError } from './types.ts'
import { addDays, computeShares, groupNets, today } from './logic.ts'

interface DB {
  profiles: Profile[]
  emails: Record<string, string>
  welcomed: Record<string, string | null>
  groups: Group[]
  members: Member[]
  pairs: Pair[]
  expenses: Expense[]
  shares: Share[]
  payments: Payment[]
  activity: Activity[]
  nextActivity: number
  session: string | null
}

const KEY = 'receipts-demo-v2'
const uid = () => crypto.randomUUID()
let clockOverride: string | null = null
const now = () => clockOverride ?? new Date().toISOString()
const fail = (code: string): never => { throw new AppError(code) }

// Fixed ids so the seed is stable across reloads.
export const DEMO = {
  me: '00000000-0000-4000-8000-00000000000a',
  rio: '00000000-0000-4000-8000-00000000000b',
  priya: '00000000-0000-4000-8000-00000000000c',
  sam: '00000000-0000-4000-8000-00000000000d',
  jo: '00000000-0000-4000-8000-00000000000e',
  dana: '00000000-0000-4000-8000-00000000000f',
  tay: '00000000-0000-4000-8000-000000000010',
  alex: '00000000-0000-4000-8000-000000000011',
}

function blank(): DB {
  return { profiles: [], emails: {}, welcomed: {}, groups: [], members: [], pairs: [], expenses: [], shares: [],
    payments: [], activity: [], nextActivity: 1, session: null }
}

// ---------------------------------------------------------------- engine
class Engine {
  db: DB
  actor: string | null = null
  constructor(db: DB) { this.db = db }

  me(): string {
    const u = this.actor
    if (!u) fail('not_signed_in')
    const p = this.db.profiles.find((x) => x.id === u)
    if (!p || p.status !== 'active') fail('account_off')
    return u!
  }
  isMember(g: string, u: string) { return this.db.members.some((m) => m.group_id === g && m.user_id === u && !m.left_at) }
  group(g: string, mustBeOpen = true): Group {
    const me = this.me()
    const grp = this.db.groups.find((x) => x.id === g)
    if (!grp || !this.isMember(g, me)) fail('not_in_group')
    if (mustBeOpen && grp!.archived_at) fail('group_archived')
    return grp!
  }
  log(g: string, kind: ActivityKind, detail: Record<string, any> = {}, e: string | null = null, p: string | null = null,
    subj: string | null = null, vis: string[] | null = null, at = now()) {
    this.db.activity.push({ id: this.db.nextActivity++, group_id: g, actor_id: this.actor!, kind, expense_id: e, payment_id: p,
      subject_user: subj, detail, visible_to: vis, created_at: at })
    const grp = this.db.groups.find((x) => x.id === g)
    if (grp && at > grp.last_activity_at) grp.last_activity_at = at
  }
  active(u: string) { return this.db.profiles.find((x) => x.id === u)?.status === 'active' }
  available(g: string, users: string[]) {
    for (const u of users) if (!this.isMember(g, u) || !this.active(u)) fail('person_not_available')
  }
  partnerOf(g: string, u: string): string | null {
    const p = this.db.pairs.find((x) => x.group_id === g && !x.ended_at && (x.user_a === u || x.user_b === u))
    return p ? (p.user_a === u ? p.user_b : p.user_a) : null
  }
  net(g: string, u: string) { return groupNets(this.db, g).get(u) ?? 0 }

  // -------- people
  finish_welcome(nick: string) {
    const me = this.me()
    this.db.profiles.find((x) => x.id === me)!.nickname = nick.trim() || null
    this.db.welcomed[me] = this.db.welcomed[me] ?? now()
  }
  update_my_profile(nick: string) {
    const me = this.me()
    this.db.profiles.find((x) => x.id === me)!.nickname = nick.trim() || null
  }

  // -------- groups
  create_group(name: string, kind: GroupKind, members: string[], at = now()): string {
    const me = this.me()
    const n = name.trim()
    if (n.length < 1 || n.length > 32) fail('name_length')
    const others = [...new Set(members)].filter((x) => x !== me)
    if (others.length === 0) fail('needs_another_member')
    for (const u of others) if (!this.active(u)) fail('person_not_available')
    const id = uid()
    this.db.groups.push({ id, name: n, kind, created_by: me, created_at: at, last_activity_at: at, archived_at: null, archived_by: null })
    for (const u of [me, ...others]) this.db.members.push({ group_id: id, user_id: u, added_by: me, joined_at: at, left_at: null })
    this.log(id, 'group_created', { name: n }, null, null, null, null, at)
    for (const u of others) this.log(id, 'member_added', {}, null, null, u, null, at)
    return id
  }
  update_group(g: string, name: string, kind: GroupKind) {
    const grp = this.group(g)
    const n = name.trim()
    if (n.length < 1 || n.length > 32) fail('name_length')
    if (grp.name === n && grp.kind === kind) return
    const before = { name: grp.name, kind: grp.kind }
    grp.name = n; grp.kind = kind
    this.log(g, 'group_edited', { before, after: { name: n, kind } })
  }
  add_members(g: string, users: string[]) {
    this.group(g)
    for (const u of users) {
      if (!this.active(u)) fail('person_not_available')
      if (this.isMember(g, u)) continue
      const old = this.db.members.find((m) => m.group_id === g && m.user_id === u)
      if (old) { old.left_at = null; old.joined_at = now(); old.added_by = this.actor }
      else this.db.members.push({ group_id: g, user_id: u, added_by: this.actor, joined_at: now(), left_at: null })
      this.log(g, 'member_added', {}, null, null, u)
    }
  }
  leave_group(g: string) {
    this.group(g, false)
    const me = this.actor!
    if (this.partnerOf(g, me)) fail('unlink_first')
    const n = this.net(g, me)
    if (n !== 0) fail(`settle_first:${Math.abs(n)}`)
    if (this.db.members.filter((m) => m.group_id === g && !m.left_at).length <= 1) fail('last_member')
    this.db.members.find((m) => m.group_id === g && m.user_id === me)!.left_at = now()
    this.log(g, 'member_left', {}, null, null, me)
  }
  archive_group(g: string, at = now()) {
    const grp = this.group(g)
    for (const v of groupNets(this.db, g).values()) if (v !== 0) fail('not_settled')
    grp.archived_at = at; grp.archived_by = this.actor
    this.log(g, 'group_archived', {}, null, null, null, null, at)
  }
  reopen_group(g: string) {
    const grp = this.group(g, false)
    grp.archived_at = null; grp.archived_by = null
    this.log(g, 'group_reopened')
  }
  delete_group(g: string) {
    this.group(g, false)
    if (this.db.expenses.some((e) => e.group_id === g && !e.deleted_at) || this.db.payments.some((p) => p.group_id === g && !p.deleted_at)) fail('group_has_money')
    const ex = new Set(this.db.expenses.filter((e) => e.group_id === g).map((e) => e.id))
    this.db.groups = this.db.groups.filter((x) => x.id !== g)
    this.db.members = this.db.members.filter((x) => x.group_id !== g)
    this.db.pairs = this.db.pairs.filter((x) => x.group_id !== g)
    this.db.expenses = this.db.expenses.filter((x) => x.group_id !== g)
    this.db.shares = this.db.shares.filter((x) => !ex.has(x.expense_id))
    this.db.payments = this.db.payments.filter((x) => x.group_id !== g)
    this.db.activity = this.db.activity.filter((x) => x.group_id !== g)
  }
  link_partner(g: string, other: string) {
    this.group(g)
    const me = this.actor!
    if (other === me) fail('pair_self')
    if (!this.isMember(g, other)) fail('person_not_available')
    if (this.partnerOf(g, me) || this.partnerOf(g, other)) fail('already_paired')
    const [a, b] = [me, other].sort()
    this.db.pairs.push({ id: uid(), group_id: g, user_a: a, user_b: b, linked_by: me, created_at: now(), ended_at: null })
    this.log(g, 'pair_linked', {}, null, null, other, [a, b])
  }
  unlink_partner(g: string) {
    this.group(g, false)
    const me = this.actor!
    const p = this.partnerOf(g, me)
    if (!p) return
    for (const x of this.db.pairs) if (x.group_id === g && !x.ended_at && (x.user_a === me || x.user_b === me)) x.ended_at = now()
    this.log(g, 'pair_unlinked', {}, null, null, p, [me, p])
  }

  // -------- expenses
  create_expense(i: ExpenseInput, at = now()): string {
    this.group(i.group)
    const me = this.actor!
    if (i.spent_on > today()) fail('date_in_future')
    this.available(i.group, [...i.users, i.paid_by])
    if (i.users.length === 1 && i.users[0] === i.paid_by) fail('nobody_owes_anything')
    const desc = i.description.trim()
    if (desc.length < 1 || desc.length > 60) fail('description_length')
    if (i.amount_cents < 1 || i.amount_cents > 9999999) fail('amount_range')
    const id = uid()
    const shares = this.shares(id, i)
    this.db.expenses.push({ id, group_id: i.group, description: desc, notes: i.notes?.trim() || null, amount_cents: i.amount_cents,
      category: i.category, category_picked: i.category_picked, paid_by: i.paid_by, split_method: i.method, spent_on: i.spent_on,
      version: 1, created_by: me, created_at: at, updated_by: null, updated_at: null, deleted_at: null, deleted_by: null })
    this.db.shares.push(...shares)
    this.log(i.group, 'expense_added', { description: desc, amount_cents: i.amount_cents }, id, null, null, null, at)
    return id
  }
  shares(id: string, i: ExpenseInput): Share[] {
    try { return computeShares(id, i.amount_cents, i.method, i.users, i.pct, i.exact) }
    catch (e) { return fail((e as Error).message) }
  }
  snapshotOf(e: Expense) {
    return { description: e.description, amount_cents: e.amount_cents, category: e.category, paid_by: e.paid_by,
      split_method: e.split_method, spent_on: e.spent_on, notes: e.notes,
      shares: Object.fromEntries(this.db.shares.filter((s) => s.expense_id === e.id).map((s) => [s.user_id, s.amount_cents])) }
  }
  update_expense(id: string, version: number, i: ExpenseInput): number {
    const e = this.db.expenses.find((x) => x.id === id) ?? fail('not_found')
    this.group(e.group_id)
    if (e.deleted_at) fail('expense_deleted')
    if (e.version !== version) fail(`version_conflict:${this.db.profiles.find((p) => p.id === e.updated_by)?.display_name ?? ''}`)
    if (i.spent_on > today()) fail('date_in_future')
    if (i.users.length === 1 && i.users[0] === i.paid_by) fail('nobody_owes_anything')
    const already = new Set([e.paid_by, ...this.db.shares.filter((s) => s.expense_id === id).map((s) => s.user_id)])
    this.available(e.group_id, [...i.users, i.paid_by].filter((u) => !already.has(u)))
    const shares = this.shares(id, i)
    const before = this.snapshotOf(e)
    Object.assign(e, { description: i.description.trim(), notes: i.notes?.trim() || null, amount_cents: i.amount_cents,
      category: i.category, category_picked: i.category_picked, paid_by: i.paid_by, split_method: i.method,
      spent_on: i.spent_on, version: e.version + 1, updated_by: this.actor, updated_at: now() })
    this.db.shares = this.db.shares.filter((s) => s.expense_id !== id).concat(shares)
    this.log(e.group_id, 'expense_edited', { before, after: this.snapshotOf(e) }, id)
    return e.version
  }
  delete_expense(id: string) {
    const e = this.db.expenses.find((x) => x.id === id) ?? fail('not_found')
    this.group(e.group_id)
    if (e.deleted_at) return
    e.deleted_at = now(); e.deleted_by = this.actor; e.version += 1
    this.log(e.group_id, 'expense_deleted', { description: e.description, amount_cents: e.amount_cents }, id)
  }
  restore_expense(id: string) {
    const e = this.db.expenses.find((x) => x.id === id) ?? fail('not_found')
    this.group(e.group_id)
    if (!e.deleted_at) return
    e.deleted_at = null; e.deleted_by = null; e.version += 1
    this.log(e.group_id, 'expense_restored', { description: e.description, amount_cents: e.amount_cents }, id)
  }

  // -------- payments
  mayRecord(g: string, from: string, to: string) {
    const me = this.actor!
    const p = this.partnerOf(g, me)
    return me === from || me === to || (p !== null && (p === from || p === to))
  }
  record_payment(g: string, from: string, to: string, amount: number, paid_on: string, at = now()): string {
    this.group(g)
    if (from === to) fail('same_person')
    if (!this.mayRecord(g, from, to)) fail('not_your_payment')
    if (amount < 1 || amount > 9999999) fail('amount_range')
    if (paid_on > today()) fail('date_in_future')
    if (!this.db.members.some((m) => m.group_id === g && m.user_id === from) || !this.db.members.some((m) => m.group_id === g && m.user_id === to)) fail('person_not_available')
    const id = uid()
    this.db.payments.push({ id, group_id: g, from_user: from, to_user: to, amount_cents: amount, paid_on, version: 1,
      created_by: this.actor!, created_at: at, updated_by: null, updated_at: null, deleted_at: null, deleted_by: null })
    this.log(g, 'payment_added', { from, to, amount_cents: amount }, null, id, null, null, at)
    return id
  }
  update_payment(id: string, version: number, amount: number, paid_on: string): number {
    const p = this.db.payments.find((x) => x.id === id) ?? fail('not_found')
    this.group(p.group_id)
    if (!this.mayRecord(p.group_id, p.from_user, p.to_user)) fail('not_your_payment')
    if (p.version !== version) fail('version_conflict:')
    if (amount < 1 || amount > 9999999) fail('amount_range')
    if (paid_on > today()) fail('date_in_future')
    const before = { amount_cents: p.amount_cents, paid_on: p.paid_on }
    p.amount_cents = amount; p.paid_on = paid_on; p.version += 1; p.updated_by = this.actor; p.updated_at = now()
    this.log(p.group_id, 'payment_edited', { from: p.from_user, to: p.to_user, before, after: { amount_cents: amount, paid_on } }, null, id)
    return p.version
  }
  delete_payment(id: string) {
    const p = this.db.payments.find((x) => x.id === id) ?? fail('not_found')
    this.group(p.group_id)
    if (!this.mayRecord(p.group_id, p.from_user, p.to_user)) fail('not_your_payment')
    if (p.deleted_at) return
    p.deleted_at = now(); p.deleted_by = this.actor; p.version += 1
    this.log(p.group_id, 'payment_deleted', { from: p.from_user, to: p.to_user, amount_cents: p.amount_cents }, null, id)
  }
  restore_payment(id: string) {
    const p = this.db.payments.find((x) => x.id === id) ?? fail('not_found')
    this.group(p.group_id)
    if (!this.mayRecord(p.group_id, p.from_user, p.to_user)) fail('not_your_payment')
    p.deleted_at = null; p.deleted_by = null; p.version += 1
    this.log(p.group_id, 'payment_added', { from: p.from_user, to: p.to_user, amount_cents: p.amount_cents, restored: true }, null, id)
  }
}

// ---------------------------------------------------------------- seed
function seed(): DB {
  const db = blank()
  const t = today()
  const mk = (id: string, name: string, email: string, extra: Partial<Profile> = {}) => {
    db.profiles.push({ id, display_name: name, nickname: null, phone: null, avatar_path: null, status: 'active',
      is_admin: false, created_at: '2026-10-01T12:00:00Z', ...extra })
    db.emails[id] = email
    db.welcomed[id] = '2026-10-01T12:00:00Z'
  }
  const D = DEMO
  mk(D.me, 'Matthew L.', 'matt@example.com', { is_admin: true })
  mk(D.rio, 'Rio M.', 'rio@example.com')
  mk(D.priya, 'Priya L.', 'priya@example.com')
  mk(D.sam, 'Sam T.', 'sam@example.com')
  mk(D.jo, 'Jo P.', 'jo@example.com')
  mk(D.dana, 'Dana K.', 'dana@example.com')
  mk(D.alex, 'Alex B.', 'alex@example.com')
  mk(D.tay, 'Tay R.', 'tay@example.com')
  db.welcomed[D.me] = null // so the welcome screen shows on first demo sign-in

  const E = new Engine(db)
  const at = (days: number, hm: string) => new Date(`${addDays(t, -days)}T${hm}:00`).toISOString()
  const as = (u: string) => { E.actor = u }
  const ex = (g: string, desc: string, cents: number, cat: Expense['category'], paid: string, users: string[], days: number, hm: string,
    method: Expense['split_method'] = 'equal', pct: number[] | null = null, exact: (number | null)[] | null = null, notes: string | null = null) =>
    E.create_expense({ group: g, description: desc, amount_cents: cents, category: cat, category_picked: false, paid_by: paid,
      method, users, pct, exact, spent_on: addDays(t, -days), notes }, at(days, hm))

  // Supper Club: you're owed
  as(D.me)
  const supper = E.create_group('Supper Club', 'other', [D.rio, D.priya, D.sam, D.jo, D.dana], at(40, '20:02'))
  as(D.me); ex(supper, 'Groceries for Sunday', 8650, 'food', D.me, [D.me, D.rio, D.priya, D.sam, D.jo], 20, '18:30')
  as(D.jo); ex(supper, 'Movie night', 5400, 'entertainment', D.jo, [D.rio, D.priya, D.sam, D.jo, D.dana], 6, '21:00')
  as(D.priya); ex(supper, 'Wine for the table', 7200, 'food', D.priya, [D.me, D.rio, D.priya, D.sam, D.jo, D.dana], 6, '19:15')
  as(D.dana); const ice = ex(supper, 'Ice and mixers', 1800, 'food', D.dana, [D.me, D.dana, D.jo], 6, '23:10')
  clockOverride = at(6, '23:20'); E.delete_expense(ice); clockOverride = null
  as(D.jo); E.record_payment(supper, D.jo, D.me, 1200, addDays(t, -3), at(3, '18:40'))
  as(D.sam); ex(supper, 'Uber to the airport', 6200, 'transport', D.sam, [D.me, D.sam, D.jo, D.rio, D.priya, D.dana], 0, '14:14')
  as(D.me); const tacos = ex(supper, 'Tacos at Los Mariscos', 16840, 'food', D.me, [D.me, D.rio, D.priya, D.sam, D.jo], 0, '09:48',
    'equal', null, null, 'Birthday dinner for Priya.')
  clockOverride = at(0, '11:40'); as(D.rio); E.update_expense(tacos, 1, { group: supper, description: 'Tacos at Los Mariscos', amount_cents: 18640, category: 'food',
    category_picked: false, paid_by: D.me, method: 'equal', users: [D.me, D.rio, D.priya, D.sam, D.jo, D.dana], pct: null, exact: null,
    spent_on: t, notes: 'Birthday dinner for Priya.' })
  clockOverride = null

  // Apartment 4B: you owe
  as(D.priya)
  const apt = E.create_group('Apartment 4B', 'home', [D.me, D.sam], at(35, '10:00'))
  ex(apt, 'October rent', 240000, 'home', D.priya, [D.me, D.priya, D.sam], 14, '21:12')
  as(D.sam); ex(apt, 'Con Ed', 9600, 'utilities', D.sam, [D.me, D.priya, D.sam], 18, '09:00')
  as(D.me); ex(apt, 'Internet', 6000, 'utilities', D.me, [D.me, D.priya, D.sam], 18, '09:30', 'exact', null, [2000, 2000, null])
  as(D.me); E.record_payment(apt, D.me, D.sam, 4000, addDays(t, -16), at(16, '12:00'))

  // Jo's birthday: gift for Jo; Rio and Dana are linked
  as(D.me)
  const bday = E.create_group("Jo's birthday", 'other', [D.rio, D.dana, D.jo, D.sam], at(5, '10:00'))
  ex(bday, 'Cake from Lady M', 9600, 'food', D.me, [D.me, D.rio, D.dana, D.sam], 2, '16:20')
  clockOverride = at(2, '17:00'); as(D.rio); E.link_partner(bday, D.dana); clockOverride = null

  // Catskills weekend: settled
  as(D.sam)
  const cats = E.create_group('Catskills weekend', 'trip', [D.me, D.rio, D.priya, D.jo], at(32, '10:00'))
  ex(cats, 'Cabin rental', 100000, 'home', D.sam, [D.me, D.rio, D.priya, D.jo, D.sam], 27, '12:00')
  for (const u of [D.me, D.rio, D.priya, D.jo]) { as(u); E.record_payment(cats, u, D.sam, 20000, addDays(t, -22), at(22, '19:00')) }

  // Beach house 2025: settled and archived
  as(D.rio)
  const beach = E.create_group('Beach house 2025', 'trip', [D.me, D.priya, D.alex], at(120, '10:00'))
  ex(beach, 'House rental', 315000, 'home', D.me, [D.me, D.rio, D.priya, D.alex], 100, '10:00')
  for (const u of [D.rio, D.priya, D.alex]) { as(u); E.record_payment(beach, u, D.me, 78750, addDays(t, -90), at(90, '10:00')) }
  as(D.priya); E.archive_group(beach, at(85, '16:05'))

  // Tay's account is turned off but Tay stays in Supper Club history
  clockOverride = at(38, '12:00'); as(D.me); E.add_members(supper, [D.tay]); clockOverride = null
  db.profiles.find((p) => p.id === D.tay)!.status = 'off'

  db.session = null
  return db
}

// ---------------------------------------------------------------- backend
function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* storage blocked: fall back to a fresh seed */ }
  return seed()
}

export function createDemoBackend(): Backend & { reset(): void } {
  let db = loadDB()
  const listeners = new Set<() => void>()
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* private mode */ } }
  const run = async <T>(fn: (e: Engine) => T): Promise<T> => {
    await new Promise((r) => setTimeout(r, 120)) // feel like a network
    const copy: DB = structuredClone(db)
    const e = new Engine(copy)
    e.actor = db.session
    const out = fn(e)   // throws leave db untouched, like a rolled-back transaction
    db = copy
    save()
    return out
  }

  return {
    mode: 'demo',
    async currentUser() { return db.session },
    async sendCode(email) {
      await new Promise((r) => setTimeout(r, 300))
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('bad_email')
    },
    async verifyCode(_email, code) {
      await new Promise((r) => setTimeout(r, 300))
      if (!/^\d{6}$/.test(code)) throw new AppError('bad_code')
      db.session = DEMO.me // the demo always signs you in as Matthew
      save()
      listeners.forEach((l) => l())
    },
    async signOut() { db.session = null; save(); listeners.forEach((l) => l()) },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    reset() { const s = db.session; db = seed(); db.session = s; db.welcomed[DEMO.me] = now(); save() },

    async load(): Promise<Snapshot> {
      const me = db.session
      if (!me) throw new AppError('not_signed_in')
      const prof = db.profiles.find((p) => p.id === me)
      if (!prof || prof.status !== 'active') throw new AppError('account_off')
      // Same visibility as the RLS policies in 0001.
      const mine = new Set(db.members.filter((m) => m.user_id === me && !m.left_at).map((m) => m.group_id))
      const exIds = new Set(db.expenses.filter((e) => mine.has(e.group_id)).map((e) => e.id))
      return structuredClone({
        me, email: db.emails[me] ?? null, welcomed: !!db.welcomed[me],
        profiles: Object.fromEntries(db.profiles.map((p) => [p.id, p])),
        groups: db.groups.filter((g) => mine.has(g.id)),
        members: db.members.filter((m) => mine.has(m.group_id)),
        pairs: db.pairs.filter((p) => p.user_a === me || p.user_b === me),
        expenses: db.expenses.filter((e) => mine.has(e.group_id)),
        shares: db.shares.filter((s) => exIds.has(s.expense_id)),
        payments: db.payments.filter((p) => mine.has(p.group_id)),
        activity: db.activity.filter((a) => mine.has(a.group_id) && (!a.visible_to || a.visible_to.includes(me))),
        loadedAt: Date.now(),
      })
    },

    finish_welcome: (n) => run((e) => e.finish_welcome(n)),
    update_my_profile: (n) => run((e) => e.update_my_profile(n)),
    create_group: (n, k, m) => run((e) => e.create_group(n, k, m)),
    update_group: (g, n, k) => run((e) => e.update_group(g, n, k)),
    add_members: (g, u) => run((e) => e.add_members(g, u)),
    leave_group: (g) => run((e) => e.leave_group(g)),
    archive_group: (g) => run((e) => e.archive_group(g)),
    reopen_group: (g) => run((e) => e.reopen_group(g)),
    delete_group: (g) => run((e) => e.delete_group(g)),
    link_partner: (g, o) => run((e) => e.link_partner(g, o)),
    unlink_partner: (g) => run((e) => e.unlink_partner(g)),
    create_expense: (i) => run((e) => e.create_expense(i)),
    update_expense: (id, v, i) => run((e) => e.update_expense(id, v, i)),
    delete_expense: (id) => run((e) => e.delete_expense(id)),
    restore_expense: (id) => run((e) => e.restore_expense(id)),
    record_payment: (g, f, t, a, d) => run((e) => e.record_payment(g, f, t, a, d)),
    update_payment: (id, v, a, d) => run((e) => e.update_payment(id, v, a, d)),
    delete_payment: (id) => run((e) => e.delete_payment(id)),
    restore_payment: (id) => run((e) => e.restore_payment(id)),
  }
}

// Pure money and wording rules shared by every screen and by the demo backend.
// The balance and plan functions are line-for-line ports of the SQL in
// 0001_schema.sql (app.group_nets, app.group_plan, app.compute_shares), so the
// app shows exactly what the database would compute.
import type { Category, Expense, GroupKind, Payment, Share, Snapshot, SplitMethod, Profile, Pair } from './types.ts'

// ---------------------------------------------------------------- money
export const MAX_CENTS = 9_999_999

export function money(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0
  const a = Math.abs(Math.round(cents))
  const s = `$${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`
  return opts.sign && neg ? `−${s}` : s
}

/** "86.5" → 8650. Returns null for anything that isn't a plain amount. */
export function parseCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '')
  if (!/^\d*(\.\d{0,2})?$/.test(t) || t === '' || t === '.') return null
  const [w, d = ''] = t.split('.')
  return Number(w || '0') * 100 + Number((d + '00').slice(0, 2))
}

/** Basis points → "16.67". */
export function pctText(bp: number): string {
  const s = (bp / 100).toFixed(2)
  return s.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export function parsePct(text: string): number | null {
  const t = text.replace(/[%\s]/g, '')
  if (!/^\d*(\.\d{0,2})?$/.test(t) || t === '' || t === '.') return null
  const [w, d = ''] = t.split('.')
  return Number(w || '0') * 100 + Number((d + '00').slice(0, 2))
}

/** Screen-reader sentence for an amount: "51 dollars 33 cents". */
export function spoken(cents: number): string {
  const a = Math.abs(cents)
  return `${Math.floor(a / 100)} dollars ${a % 100} cents`
}

// ---------------------------------------------------------------- dates
export function today(): string {
  const d = new Date()
  return iso(d)
}
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number): string {
  const d = parseDay(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Today", "Yesterday", "Nov 12", or "Nov 12, 2025" for other years. */
export function dayLabel(s: string): string {
  const t = today()
  if (s === t) return 'Today'
  if (s === addDays(t, -1)) return 'Yesterday'
  const d = parseDay(s)
  const base = `${MON[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === new Date().getFullYear() ? base : `${base}, ${d.getFullYear()}`
}
export function shortDay(s: string): string {
  const d = parseDay(s)
  const base = `${MON[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === new Date().getFullYear() ? base : `${base}, ${d.getFullYear()}`
}
export function longDay(s: string): string {
  const d = parseDay(s)
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}
export function clock(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
export function tsDay(ts: string): string {
  return iso(new Date(ts))
}
export function ago(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  return shortDay(tsDay(ts))
}

// ---------------------------------------------------------------- names
export const CAT_NAME: Record<Category, string> = {
  food: 'Food and drink', entertainment: 'Entertainment', home: 'Home', life: 'Life',
  transport: 'Transportation', utilities: 'Utilities', uncategorized: 'Uncategorized',
}
export const CATEGORIES: Category[] = ['food', 'entertainment', 'home', 'life', 'transport', 'utilities', 'uncategorized']
export const GROUP_KINDS: GroupKind[] = ['trip', 'home', 'couple', 'other']
export const GROUP_NAME: Record<GroupKind, string> = { trip: 'Trip', home: 'Home', couple: 'Couple', other: 'Other' }
export const METHOD_NAME: Record<SplitMethod, string> = { equal: 'Equally', exact: 'Exact', percent: 'Percent' }

/** Display name, with the nickname in brackets only when two people share a name. */
export function nameOf(p: Profile | undefined, all?: Record<string, Profile>): string {
  if (!p) return 'Someone'
  if (all && p.nickname) {
    const clash = Object.values(all).some((o) => o.id !== p.id && o.display_name === p.display_name)
    if (clash) return `${p.display_name} (${p.nickname})`
  }
  return p.display_name
}
export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s.]/gu, '').split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}
export function firstName(name: string): string {
  return name.split(' ')[0]
}

// ---------------------------------------------------------------- guesses
const CAT_WORDS: [Category, RegExp][] = [
  ['food', /\b(food|dinner|lunch|breakfast|brunch|taco|pizza|sushi|burger|coffee|cafe|wine|beer|drinks?|bar|restaurant|groceries|grocery|trader|whole ?foods|snacks?|cake|bagels?|ice|mixers|takeout|delivery|doordash|seamless|ramen|bbq|meal)\b/i],
  ['transport', /\b(uber|lyft|taxi|cab|gas|tolls?|parking|train|subway|metro|bus|flight|airline|plane|car|rental car|zipcar|ferry|citi ?bike|mta|amtrak)\b/i],
  ['home', /\b(rent|cabin|house|airbnb|vrbo|hotel|motel|furniture|ikea|cleaning|cleaner|supplies|household|lodging)\b/i],
  ['utilities', /\b(con ?ed|electric|electricity|power|water|internet|wifi|wi-fi|cable|phone bill|utilities|heat|gas bill|trash|spectrum|verizon|comcast)\b/i],
  ['entertainment', /\b(movie|movies|cinema|concert|show|tickets?|museum|game|games|bowling|karaoke|club|party|festival|netflix|spotify|theater|theatre|comedy)\b/i],
  ['life', /\b(gift|present|birthday|doctor|pharmacy|medicine|haircut|gym|clothes|laundry|insurance|wedding|donation|flowers)\b/i],
]
export function guessCategory(desc: string): Category {
  // Strip a trailing plural "s"/"es" from each word so "Tacos" matches "taco".
  const words = desc.toLowerCase().replace(/[’']s\b/g, '')
  const singular = words.replace(/\b(\w{3,}?)(es|s)\b/g, '$1')
  for (const [c, re] of CAT_WORDS) if (re.test(words) || re.test(singular)) return c
  return 'uncategorized'
}
export function guessKind(name: string): GroupKind {
  if (/\b(trip|weekend|vacation|beach|ski|camping|cabin|getaway|travel|road ?trip|tour|festival|catskills|upstate|bachelor|bachelorette)\b/i.test(name)) return 'trip'
  if (/\b(apartment|apt|house|home|roommates?|flat|rent|\d+[a-z]\b)/i.test(name)) return 'home'
  if (/\b(us|couple|date|anniversary|&|and me|\+)\b/i.test(name) || /\s(\+|&)\s/.test(name)) return 'couple'
  return 'other'
}

// ---------------------------------------------------------------- shares
function hashtext(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/** Port of app.compute_shares. Throws the same error codes. */
export function computeShares(expenseId: string, amount: number, method: SplitMethod,
  users: string[], pct: number[] | null, exact: (number | null)[] | null): Share[] {
  const n = users.length
  if (n === 0) throw new Error('split_needs_someone')
  const start = Math.abs(hashtext(expenseId)) % n
  const amounts = new Array(n).fill(0)
  if (method === 'equal') {
    const base = Math.floor(amount / n)
    const rem = amount - base * n
    for (let i = 0; i < n; i++) amounts[i] = base
    for (let k = 0; k < rem; k++) amounts[(start + k) % n] += 1
  } else if (method === 'percent') {
    const p = pct ?? []
    const total = p.reduce((a, b) => a + b, 0)
    if (total !== 10000) throw new Error('percent_must_be_100')
    for (let i = 0; i < n; i++) amounts[i] = Math.floor((amount * p[i]) / 10000)
    let rem = amount - amounts.reduce((a, b) => a + b, 0)
    let k = 0
    while (rem > 0) {
      const i = (start + k) % n
      if (p[i] > 0) { amounts[i] += 1; rem -= 1 }
      k += 1
    }
  } else {
    const e = exact ?? []
    let typed = 0
    let blank = -1
    for (let i = 0; i < n; i++) {
      if (e[i] == null) {
        if (blank >= 0) throw new Error('exact_one_blank_only')
        blank = i
      } else { amounts[i] = e[i]!; typed += e[i]! }
    }
    if (blank >= 0) {
      if (typed > amount) throw new Error('exact_over_total')
      amounts[blank] = amount - typed
    } else if (typed !== amount) throw new Error('exact_must_add_up')
  }
  return users.map((u, i) => ({
    expense_id: expenseId, user_id: u,
    percent_bp: method === 'percent' ? pct![i] : null,
    exact_cents: method === 'exact' ? exact![i] : null,
    amount_cents: amounts[i],
  }))
}

/** Spread `total` over `n` people as evenly as cents allow, extra cents first. */
export function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(total / n)
  const rem = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0))
}

// ---------------------------------------------------------------- balances
export interface Ledger {
  expenses: Expense[]
  shares: Share[]
  payments: Payment[]
  members: { group_id: string; user_id: string }[]
}

/** Port of app.group_nets: positive = is owed, negative = owes. Every member who ever joined is included. */
export function groupNets(L: Ledger, g: string): Map<string, number> {
  const nets = new Map<string, number>()
  for (const m of L.members) if (m.group_id === g) nets.set(m.user_id, 0)
  const live = new Set<string>()
  for (const e of L.expenses) {
    if (e.group_id !== g || e.deleted_at) continue
    live.add(e.id)
    nets.set(e.paid_by, (nets.get(e.paid_by) ?? 0) + e.amount_cents)
  }
  for (const s of L.shares) {
    if (!live.has(s.expense_id)) continue
    nets.set(s.user_id, (nets.get(s.user_id) ?? 0) - s.amount_cents)
  }
  for (const p of L.payments) {
    if (p.group_id !== g || p.deleted_at) continue
    nets.set(p.from_user, (nets.get(p.from_user) ?? 0) + p.amount_cents)
    nets.set(p.to_user, (nets.get(p.to_user) ?? 0) - p.amount_cents)
  }
  return nets
}

export interface PlanLine { from: string; to: string; amount: number }

/** Port of app.group_plan: biggest debtor pays biggest creditor until all are zero. Ties by user id. */
export function groupPlan(nets: Map<string, number>): PlanLine[] {
  const ids = [...nets.keys()].filter((k) => nets.get(k) !== 0).sort()
  const v = ids.map((k) => nets.get(k)!)
  const out: PlanLine[] = []
  for (;;) {
    let di = -1, ci = -1
    for (let i = 0; i < ids.length; i++) {
      if (v[i] < 0 && (di < 0 || v[i] < v[di])) di = i
      if (v[i] > 0 && (ci < 0 || v[i] > v[ci])) ci = i
    }
    if (di < 0 || ci < 0) break
    const amt = Math.min(-v[di], v[ci])
    out.push({ from: ids[di], to: ids[ci], amount: amt })
    v[di] += amt
    v[ci] -= amt
  }
  return out
}

// ---------------------------------------------------------------- views over a snapshot
export function activeMembers(s: Snapshot, g: string): string[] {
  return s.members.filter((m) => m.group_id === g && !m.left_at).map((m) => m.user_id)
}
export function isMember(s: Snapshot, g: string, u = s.me): boolean {
  return s.members.some((m) => m.group_id === g && m.user_id === u && !m.left_at)
}
export function partnerOf(s: Snapshot, g: string, u = s.me): string | null {
  const p = s.pairs.find((x) => x.group_id === g && !x.ended_at && (x.user_a === u || x.user_b === u))
  return p ? (p.user_a === u ? p.user_b : p.user_a) : null
}
export function pairOf(pairs: Pair[], g: string, u: string): Pair | undefined {
  return pairs.find((x) => x.group_id === g && !x.ended_at && (x.user_a === u || x.user_b === u))
}

export interface GroupMoney {
  nets: Map<string, number>
  plan: PlanLine[]
  mine: number         // my net, or me + partner when linked
  partner: string | null
  myLines: PlanLine[]  // plan lines that involve me (or my partner), minus lines between us
}

export function groupMoney(s: Snapshot, g: string): GroupMoney {
  const nets = groupNets(s, g)
  const plan = groupPlan(nets)
  const partner = partnerOf(s, g)
  const us = new Set([s.me, ...(partner ? [partner] : [])])
  const mine = [...us].reduce((a, u) => a + (nets.get(u) ?? 0), 0)
  const myLines = plan.filter((l) => (us.has(l.from) || us.has(l.to)) && !(us.has(l.from) && us.has(l.to)))
  return { nets, plan, mine, partner, myLines }
}

/** Port of public.friend_balances: your net with each person, from plan lines of shared groups. */
export function friendBalances(s: Snapshot): Map<string, { net: number; groups: string[] }> {
  const out = new Map<string, { net: number; groups: string[] }>()
  const mine = s.groups.filter((g) => isMember(s, g.id))
  for (const g of mine) {
    for (const m of s.members) {
      if (m.group_id !== g.id || m.user_id === s.me) continue
      const r = out.get(m.user_id) ?? { net: 0, groups: [] }
      if (!r.groups.includes(g.id)) r.groups.push(g.id)
      out.set(m.user_id, r)
    }
    for (const l of groupPlan(groupNets(s, g.id))) {
      if (l.to === s.me && out.has(l.from)) out.get(l.from)!.net += l.amount
      if (l.from === s.me && out.has(l.to)) out.get(l.to)!.net -= l.amount
    }
  }
  return out
}

/** Net between me and one friend inside one group, from the plan. Positive = they owe me. */
export function pairNetInGroup(s: Snapshot, g: string, friend: string): number {
  let n = 0
  for (const l of groupPlan(groupNets(s, g))) {
    if (l.from === friend && l.to === s.me) n += l.amount
    if (l.from === s.me && l.to === friend) n -= l.amount
  }
  return n
}

/** My share (what I owe) and what I lent on one expense. */
export function myEffect(e: Expense, shares: Share[], me: string): { kind: 'owed' | 'owe' | 'none'; amount: number } {
  const mine = shares.find((x) => x.expense_id === e.id && x.user_id === me)?.amount_cents ?? 0
  if (e.paid_by === me) {
    const lent = e.amount_cents - mine
    return lent > 0 ? { kind: 'owed', amount: lent } : { kind: 'none', amount: 0 }
  }
  return mine > 0 ? { kind: 'owe', amount: mine } : { kind: 'none', amount: 0 }
}

export function totals(s: Snapshot): { owed: number; owe: number; net: number } {
  let owed = 0, owe = 0
  for (const g of s.groups) {
    if (!isMember(s, g.id)) continue
    const n = groupNets(s, g.id).get(s.me) ?? 0
    if (n > 0) owed += n
    else owe -= n
  }
  return { owed, owe, net: owed - owe }
}

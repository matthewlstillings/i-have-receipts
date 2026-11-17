// Activity sentences (spec, "Activity" table) and the change list for C8.
import type { ReactNode } from 'react'
import type { Activity, Snapshot } from '../data/types.ts'
import { CAT_NAME, METHOD_NAME, money, nameOf, shortDay } from '../data/logic.ts'

export function who(s: Snapshot, id: string | null | undefined, cap = true): string {
  if (!id) return 'Someone'
  if (id === s.me) return cap ? 'You' : 'you'
  return nameOf(s.profiles[id], s.profiles)
}

/** One line of activity, as JSX with the actor in bold. */
export function sentence(s: Snapshot, a: Activity, withGroup: boolean): ReactNode {
  const A = <b>{who(s, a.actor_id)}</b>
  const g = s.groups.find((x) => x.id === a.group_id)
  const inG = withGroup && g ? ` in ${g.name}` : ''
  const d = a.detail ?? {}
  const ex = a.expense_id ? s.expenses.find((e) => e.id === a.expense_id) : null
  const desc = ex?.description ?? d.description ?? d.after?.description ?? 'an expense'
  const pay = (from: string, to: string, cents: number) => {
    if (from === a.actor_id) return <>{A} recorded paying {who(s, to, false)} {money(cents)}{inG}</>
    if (to === a.actor_id) return <>{A} recorded {who(s, from, false)} paying {a.actor_id === s.me ? 'you' : 'them'} {money(cents)}{inG}</>
    return <>{A} recorded {who(s, from, false)} paying {who(s, to, false)} {money(cents)}{inG}</>
  }
  switch (a.kind) {
    case 'expense_added': return <>{A} added {desc}{inG}</>
    case 'expense_deleted': return <>{A} deleted {desc}{inG}</>
    case 'expense_restored': return <>{A} restored {desc}{inG}</>
    case 'expense_edited': {
      const c = changes(s, d.before, d.after)[0]
      return <>{A} changed {desc}{c ? <>: {c.plain}</> : null}{inG}</>
    }
    case 'payment_added': return d.restored ? <>{A} restored a {money(d.amount_cents)} payment{inG}</> : pay(d.from, d.to, d.amount_cents)
    case 'payment_edited': return <>{A} changed a payment: {money(d.before?.amount_cents ?? 0)} → {money(d.after?.amount_cents ?? 0)}{inG}</>
    case 'payment_deleted': return <>{A} deleted a {money(d.amount_cents)} payment{inG}</>
    case 'member_added': return <>{A} added {who(s, a.subject_user, false)}{withGroup && g ? ` to ${g.name}` : ''}</>
    case 'member_left': return <>{A} left{withGroup && g ? ` ${g.name}` : ' the group'}</>
    case 'group_created': return <>{A} created {d.name ?? g?.name}</>
    case 'group_edited': return d.before?.name !== d.after?.name
      ? <>{A} renamed {d.before?.name} to {d.after?.name}</>
      : <>{A} changed the icon of {g?.name}</>
    case 'group_archived': return <>{A} archived {g?.name}</>
    case 'group_reopened': return <>{A} reopened {g?.name}</>
    case 'pair_linked': return <>{A} linked with {who(s, a.subject_user, false)}{inG} · only you two see this</>
    case 'pair_unlinked': return <>{A} unlinked from {who(s, a.subject_user, false)}{inG}</>
  }
}

export interface Change { label: string; from: string; to: string; plain: string; extra?: string }

/** Field-by-field differences between two expense snapshots (activity detail before/after). */
export function changes(s: Snapshot, b: any, a: any): Change[] {
  if (!b || !a) return []
  const out: Change[] = []
  const add = (label: string, from: string, to: string, extra?: string) =>
    out.push({ label, from, to, plain: `${label === 'Amount' ? '' : label.toLowerCase() + ' '}${from} → ${to}`.trim(), extra })
  if (b.amount_cents !== a.amount_cents) add('Amount', money(b.amount_cents), money(a.amount_cents))
  if (b.description !== a.description) add('Description', b.description, a.description)
  if (b.paid_by !== a.paid_by) add('Paid by', who(s, b.paid_by), who(s, a.paid_by))
  const bp = Object.keys(b.shares ?? {}).filter((k) => b.shares[k] > 0)
  const ap = Object.keys(a.shares ?? {}).filter((k) => a.shares[k] > 0)
  if (b.split_method !== a.split_method) add('Split', METHOD_NAME[b.split_method as 'equal'], METHOD_NAME[a.split_method as 'equal'])
  else if (bp.length !== ap.length) {
    const added = ap.filter((x) => !bp.includes(x)).map((x) => who(s, x))
    const removed = bp.filter((x) => !ap.includes(x)).map((x) => who(s, x))
    const extra = [added.length ? `added ${added.join(', ')}` : '', removed.length ? `removed ${removed.join(', ')}` : ''].filter(Boolean).join('; ')
    add('Split', `${bp.length} people`, `${ap.length} people`, extra)
  } else if (JSON.stringify(b.shares) !== JSON.stringify(a.shares) && b.amount_cents === a.amount_cents) add('Split', 'old shares', 'new shares')
  if (b.category !== a.category) add('Category', CAT_NAME[b.category as 'food'], CAT_NAME[a.category as 'food'])
  if (b.spent_on !== a.spent_on) add('Date', shortDay(b.spent_on), shortDay(a.spent_on))
  if ((b.notes ?? '') !== (a.notes ?? '')) add('Note', b.notes ? 'old note' : 'none', a.notes ? 'new note' : 'removed')
  return out
}

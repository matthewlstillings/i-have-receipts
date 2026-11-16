// Rows and blocks used on more than one screen.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Expense, Group, Payment, Snapshot } from '../data/types.ts'
import { activeMembers, dayLabel, groupMoney, money, myEffect, nameOf, spoken, totals } from '../data/logic.ts'
import { Amount, Av, Label, Mis, Mk, PayTile, Settled, Tile, Stroke, Chev, OfflineBar } from '../ui/kit.tsx'
import { useStore } from '../data/store.tsx'
import { who } from '../ui/words.tsx'

export function PageHead({ title, sub }: { title: string; sub?: string }) {
  return <>
    <div className="bigt" style={{ paddingTop: 8 }}><Mis text={title} /></div>
    {sub && <p className="cap">{sub}</p>}
  </>
}

/** Offline bar, "last updated" line and the thin refresh bar (spec, Offline + Loading). */
export function Status({ top }: { top?: boolean }) {
  const { online } = useStore()
  if (!online && top) return <OfflineBar />
  return null
}
export function LastUpdated() {
  const { online, snap } = useStore()
  if (online || !snap) return null
  return <p className="lastup">Last updated {new Date(snap.loadedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
}

export function Overall({ s }: { s: Snapshot }) {
  const t = totals(s)
  const lbl = t.net > 0 ? "Overall · you're owed" : t.net < 0 ? 'Overall · you owe' : 'Overall'
  return (
    <section className="ovr" aria-label={`Overall: ${t.net === 0 ? 'settled' : (t.net > 0 ? "you're owed " : 'you owe ') + spoken(t.net)}`}>
      <Label>{lbl}</Label>
      {t.net === 0 && t.owed === 0 ? <Settled big /> : <b className={t.net > 0 ? 'mis y' : ''} style={t.net > 0 ? { color: 'var(--hunter)' } : undefined} data-t={money(Math.abs(t.net))}>{money(Math.abs(t.net))}</b>}
      {(t.owed > 0 || t.owe > 0) && <>
        <div className="split2" aria-hidden="true">
          {t.owed > 0 && <span className="sg owed" style={{ flex: t.owed }} />}
          {t.owe > 0 && <span className="sg owe" style={{ flex: t.owe }} />}
        </div>
        <div className="leg"><span><Mk kind="owed" />Owed to you {money(t.owed)}</span><span><Mk kind="owe" />You owe {money(t.owe)}</span></div>
      </>}
    </section>
  )
}

export function GroupRow({ s, g, sel, sub }: { s: Snapshot; g: Group; sel?: boolean; sub?: string }) {
  const m = groupMoney(s, g.id)
  const n = activeMembers(s, g.id).length
  const right = m.mine === 0
    ? <span className="ra"><Settled /></span>
    : <Amount kind={m.mine > 0 ? 'owed' : 'owe'} amount={money(Math.abs(m.mine))} label={m.mine > 0 ? "you're owed" : 'you owe'} />
  return (
    <Link className={`row${sel ? ' sel-row' : ''}`} to={`/g/${g.id}`} aria-current={sel ? 'page' : undefined}>
      <Tile cat={g.kind} />
      <span className="et big"><b>{g.name}</b><span>{sub ?? `${n} ${n === 1 ? 'person' : 'people'}`}</span></span>
      {right}
    </Link>
  )
}

export function PersonRow({ s, id, meta, net, to, sel, tag, chevron, youLabel }: {
  s: Snapshot; id: string; meta?: string; net?: number | null; to?: string; sel?: boolean; tag?: ReactNode; chevron?: boolean; youLabel?: boolean
}) {
  const p = s.profiles[id]
  const isMe = id === s.me
  let right: ReactNode = null
  if (net === 0) right = <span className="ra"><Settled /></span>
  else if (net != null) {
    right = youLabel
      ? <Amount kind={net > 0 ? 'owed' : 'owe'} amount={money(Math.abs(net))} label={net > 0 ? (isMe ? 'is owed' : 'is owed') : (isMe ? 'owes' : 'owes')} />
      : <Amount kind={net > 0 ? 'owed' : 'owe'} amount={money(Math.abs(net))} label={net > 0 ? 'owes you' : 'you owe'} />
  }
  const body = <>
    <Av p={p} />
    <span className="et big"><b>{isMe ? 'You' : nameOf(p, s.profiles)}</b>{meta != null && <span>{meta}</span>}{tag}</span>
    {right}{chevron && <Chev />}
  </>
  return to
    ? <Link className={`row${sel ? ' sel-row' : ''}`} to={to} aria-current={sel ? 'page' : undefined}>{body}</Link>
    : <div className="row">{body}</div>
}

type Item = { t: 'e'; e: Expense; at: string } | { t: 'p'; p: Payment; at: string }

/** Expenses and payments in one list, grouped by day, newest first (spec, Expense list). */
export function MoneyList({ s, g, flash, limit = 50, more }: { s: Snapshot; g: string; flash?: string; limit?: number; more?: () => void }) {
  const items: Item[] = [
    ...s.expenses.filter((e) => e.group_id === g && !e.deleted_at).map((e) => ({ t: 'e' as const, e, at: e.spent_on + e.created_at })),
    ...s.payments.filter((p) => p.group_id === g && !p.deleted_at).map((p) => ({ t: 'p' as const, p, at: p.paid_on + p.created_at })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))
  const shown = items.slice(0, limit)
  const out: ReactNode[] = []
  let day = ''
  for (const it of shown) {
    const d = it.t === 'e' ? it.e.spent_on : it.p.paid_on
    if (d !== day) { day = d; out.push(<div className="dayhead" key={'d' + d}>{dayLabel(d)}</div>) }
    out.push(it.t === 'e' ? <ExpenseRow key={it.e.id} s={s} e={it.e} flash={flash === it.e.id} /> : <PaymentRow key={it.p.id} s={s} p={it.p} />)
  }
  return <div className="list">{out}{items.length > limit && more &&
    <button type="button" className="lnk" style={{ alignSelf: 'center', margin: '12px 0' }} onClick={more}>Show older</button>}</div>
}

export function ExpenseRow({ s, e, flash }: { s: Snapshot; e: Expense; flash?: boolean }) {
  const eff = myEffect(e, s.shares, s.me)
  const meta = `${who(s, e.paid_by)} paid ${money(e.amount_cents)}`
  return (
    <Link className={`row${flash ? ' flash' : ''}`} to={`/e/${e.id}`}>
      <Tile cat={e.category} />
      <span className="et"><b>{e.description}</b><span>{meta}</span></span>
      {eff.kind === 'none'
        ? <span className="ra"><span className="rl" style={{ color: 'var(--soft)' }}>not in it</span></span>
        : <Amount kind={eff.kind} amount={money(eff.amount)} label={eff.kind === 'owed' ? 'you lent' : 'you owe'} />}
    </Link>
  )
}

export function paymentTitle(s: Snapshot, p: Payment): string {
  const from = who(s, p.from_user), to = who(s, p.to_user, false)
  return `${from} paid ${to}`
}

export function PaymentRow({ s, p }: { s: Snapshot; p: Payment }) {
  const lbl = p.to_user === s.me ? 'paid you' : p.from_user === s.me ? 'you paid' : 'payment'
  return (
    <Link className="row" to={`/p/${p.id}`}>
      <PayTile />
      <span className="et"><b>{paymentTitle(s, p)}</b><span>Recorded by {who(s, p.created_by, false)}</span></span>
      <span className="ra"><span className="rv g">{money(p.amount_cents)}</span><span className="rl">{lbl}</span></span>
    </Link>
  )
}

export const ArchivedRow = ({ n }: { n: number }) => (
  <Link className="row" to="/groups/archived" style={{ minHeight: 52 }}>
    <span className="ct" style={{ background: 'var(--cream)' }}><Stroke name="archive" size={20} /></span>
    <span className="et big"><b>Archived</b><span>{n} {n === 1 ? 'group' : 'groups'}</span></span><Chev />
  </Link>
)

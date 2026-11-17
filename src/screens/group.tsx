// B3 group page (+ B4 balances, B5 activity), B6 menu, B11 link partner,
// D1 settle up, H1 confirms, A6 not in this group.
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSnap, useStore, errorText } from '../data/store.tsx'
import type { Snapshot } from '../data/types.ts'
import { activeMembers, clock, dayLabel, groupMoney, isMember, money, myEffect, nameOf, spoken, tsDay, type PlanLine } from '../data/logic.ts'
import { Amount, Av, Bold, Btn, DangerMark, Dialog, Empty, Fab, Label, MenuRows, Mis, Mk, Ph, Settled, Sheet, Stroke, TopBar, type MenuItem } from '../ui/kit.tsx'
import { MoneyList, PersonRow, Status } from './common.tsx'
import { useBack } from '../ui/nav.ts'
import { useLayout } from '../ui/layout.ts'
import { sentence, who } from '../ui/words.tsx'

export function NotInGroup() {
  const nav = useNavigate()
  const back = useBack('/groups')
  return <>
    <TopBar left="back" onLeft={back} />
    <div className="empty" style={{ flex: 1, justifyContent: 'center' }}>
      <span className="heading">You're not in this group</span>
      <p style={{ color: 'var(--ink)' }}>Only members can see a group. Ask someone in it to add you.</p>
      <Btn kind="pri" onClick={() => nav('/groups')}>Go to Groups</Btn>
    </div>
  </>
}

type Overlay = null | 'menu' | 'settle' | 'link' | 'delete' | 'leave' | 'unlink'

export function GroupPage() {
  const s = useSnap()
  const { gid } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const loc = useLocation()
  const { online, refreshing } = useStore()
  const { expanded } = useLayout()
  const back = useBack('/groups')
  const [overlay, setOverlay] = useState<Overlay>((loc.state as any)?.settle ? 'settle' : null)
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(50)
  const g = s.groups.find((x) => x.id === gid)
  useEffect(() => { setOverlay((loc.state as any)?.settle ? 'settle' : null); setLimit(50) }, [gid]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!g || !isMember(s, g.id)) return <NotInGroup />

  const tab = params.get('tab') ?? 'expenses'
  const setTab = (t: string) => setParams(t === 'expenses' ? {} : { tab: t }, { replace: true })
  const n = activeMembers(s, g.id).length
  const flash = (loc.state as any)?.flash as string | undefined
  const archived = !!g.archived_at
  const hasMoney = s.expenses.some((e) => e.group_id === g.id && !e.deleted_at) || s.payments.some((p) => p.group_id === g.id && !p.deleted_at)

  return <>
    {refreshing && <div className="slidebar" aria-hidden="true"><i /></div>}
    {expanded
      ? <div className="tb" style={{ margin: 0 }}><span className="t" /><button type="button" className="ib" aria-label="More" onClick={() => setOverlay('menu')}><Bold name="more" size={22} /></button></div>
      : <TopBar left="back" onLeft={back} right="more" more={() => setOverlay('menu')} />}
    <Status top />
    {archived && <ArchivedNote gid={g.id} />}
    <div className="bigt"><Label>{archived ? 'Archived' : 'Group'} · {n} {n === 1 ? 'person' : 'people'}</Label><Mis text={g.name} /></div>
    <BalanceCard s={s} gid={g.id} open={open} setOpen={setOpen} onSettle={() => setOverlay('settle')} hasMoney={hasMoney} />
    <nav className="utabs" aria-label="Group views">
      {[['expenses', 'Expenses'], ['balances', 'Balances'], ['activity', 'Activity']].map(([k, l]) => (
        <button key={k} type="button" className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}</button>
      ))}
    </nav>
    {tab === 'expenses' && (hasMoney
      ? <MoneyList s={s} g={g.id} flash={flash} limit={limit} more={() => setLimit(limit + 50)} />
      : <Empty title="No expenses yet" text={`Add the first one. Everyone in ${g.name} will see it.`}>
        {!archived && <Btn kind="pri" icon={<Bold name="plus" size={16} />} disabled={!online} onClick={() => nav(`/g/${g.id}/add`)}>Add expense</Btn>}
      </Empty>)}
    {tab === 'balances' && <BalancesTab s={s} gid={g.id} onSettle={() => setOverlay('settle')} />}
    {tab === 'activity' && <GroupActivity s={s} gid={g.id} />}
    {!archived && hasMoney && <Fab text="Add expense" off={!online} minimal={open && !expanded} onClick={() => nav(`/g/${g.id}/add`)} />}

    {overlay === 'menu' && <GroupMenu s={s} gid={g.id} close={() => setOverlay(null)} go={setOverlay} />}
    {overlay === 'settle' && <SettleUp s={s} gid={g.id} close={() => setOverlay(null)} />}
    {overlay === 'link' && <LinkPartner s={s} gid={g.id} close={() => setOverlay(null)} />}
    {overlay === 'delete' && <ConfirmDelete gid={g.id} name={g.name} close={() => setOverlay(null)} />}
    {overlay === 'leave' && <ConfirmLeave gid={g.id} name={g.name} close={() => setOverlay(null)} />}
    {overlay === 'unlink' && <ConfirmUnlink s={s} gid={g.id} close={() => setOverlay(null)} />}
  </>
}

function ArchivedNote({ gid }: { gid: string }) {
  const { write, online } = useStore()
  const [busy, setBusy] = useState(false)
  return (
    <div className="note" style={{ alignItems: 'center', boxShadow: 'inset 0 0 0 2px var(--midnight)' }}>
      <Stroke name="archive" size={20} />
      <span style={{ flex: 1 }}>Archived. Reopen it to add or change anything.</span>
      <Btn kind="sec" sm busy={busy} disabled={!online} onClick={async () => { setBusy(true); try { await write((w) => w.reopen_group(gid)) } finally { setBusy(false) } }}>Reopen</Btn>
    </div>
  )
}

function lineText(s: Snapshot, l: PlanLine, us: Set<string>): string {
  if (l.to === s.me) return `${who(s, l.from)} owes you`
  if (l.from === s.me) return `You owe ${who(s, l.to)}`
  // a partner's line
  if (us.has(l.to)) return `${who(s, l.from)} owes ${who(s, l.to)}`
  return `${who(s, l.from)} owes ${who(s, l.to)}`
}

function BalanceCard({ s, gid, open, setOpen, onSettle, hasMoney }: { s: Snapshot; gid: string; open: boolean; setOpen: (b: boolean) => void; onSettle: () => void; hasMoney: boolean }) {
  const { write, online, showToast } = useStore()
  const [busy, setBusy] = useState(false)
  const g = s.groups.find((x) => x.id === gid)!
  const m = groupMoney(s, gid)
  const us = new Set([s.me, ...(m.partner ? [m.partner] : [])])
  const pname = m.partner ? who(s, m.partner) : ''
  if (!hasMoney) return (
    <section className="bal"><span className="label">Group balance</span><p className="small" style={{ color: 'var(--ink)' }}>Nothing owed yet.</p></section>
  )
  if (m.mine === 0) {
    const everyone = [...m.nets.values()].every((v) => v === 0)
    return (
      <section className="bal" aria-label="Your balance">
        <div className="top"><span className="sum"><Label>{everyone ? 'Group balance' : m.partner ? `You + ${pname}` : 'Your balance'}</Label><Settled big /></span></div>
        <p className="small" style={{ color: 'var(--ink)' }}>{everyone
          ? (g.archived_at ? 'Everyone was settled when this was archived.' : "Everyone's settled. Archive it to tidy up your list; you can reopen it any time.")
          : "You're settled here. Others in the group still owe each other."}</p>
        {everyone && !g.archived_at && <div className="acts"><Btn kind="sec" sm icon={<Stroke name="archive" size={16} />} busy={busy} disabled={!online}
          onClick={async () => { setBusy(true); try { await write((w) => w.archive_group(gid)); showToast({ text: `Archived ${g.name}.` }) } catch (e) { showToast({ text: errorText(e) }) } finally { setBusy(false) } }}>Archive group</Btn></div>}
      </section>
    )
  }
  const owed = m.mine > 0
  const head = m.partner ? `You + ${pname} ${owed ? 'are owed' : 'owe'}` : owed ? "You're owed overall" : 'You owe overall'
  return (
    <section className="bal" aria-label={`${head} ${spoken(Math.abs(m.mine))}`}>
      <div className="top">
        <span className="sum"><Label>{head}</Label>
          <span className={`bnum${owed ? '' : ' owe'} mis y`} data-t={money(Math.abs(m.mine))}>{money(Math.abs(m.mine))}</span></span>
        <button type="button" className="ib" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} breakdown`}
          style={{ transform: `rotate(${open ? 180 : 0}deg)` }} onClick={() => setOpen(!open)}><Bold name="down" size={18} /></button>
      </div>
      {m.partner && <span className="tag pair" style={{ marginTop: 0 }}>Linked with {pname} · only you two see this</span>}
      {open && <div className="bl">
        {m.myLines.map((l, i) => (
          <div className="mini" key={i}><Mk kind={us.has(l.to) ? 'owed' : 'owe'} /><span>{lineText(s, l, us)}</span><b>{money(l.amount)}</b></div>
        ))}
      </div>}
      {!g.archived_at && <div className="acts"><Btn kind="sec" sm disabled={!online} onClick={onSettle}>Settle up</Btn></div>}
    </section>
  )
}

function BalancesTab({ s, gid, onSettle }: { s: Snapshot; gid: string; onSettle: () => void }) {
  const { online } = useStore()
  const m = groupMoney(s, gid)
  const g = s.groups.find((x) => x.id === gid)!
  const ids = [...m.nets.keys()].filter((id) => activeMembers(s, gid).includes(id) || (m.nets.get(id) ?? 0) !== 0)
    .sort((a, b) => (a === s.me ? -1 : b === s.me ? 1 : (m.nets.get(b) ?? 0) - (m.nets.get(a) ?? 0)))
  const metaFor = (id: string) => {
    const out = m.plan.filter((l) => l.from === id).map((l) => `Pays ${who(s, l.to, false)} ${money(l.amount)}`)
    const inn = m.plan.filter((l) => l.to === id).map((l) => `${who(s, l.from)} pays ${money(l.amount)}`)
    return [...out, ...inn].join(' · ') || (id === s.me ? 'You' : '')
  }
  return <>
    {m.plan.length > 0 ? (
      <section className="note" style={{ flexDirection: 'column', gap: 8 }} aria-label="Payment plan">
        <Label>The plan · {m.plan.length} {m.plan.length === 1 ? 'payment settles' : 'payments settle'} everyone</Label>
        {m.plan.map((l, i) => (
          <div className="mini" key={i}><Av p={s.profiles[l.from]} size={28} /><span>{who(s, l.from)} {l.from === s.me ? 'pay' : 'pays'} {who(s, l.to, false)}</span><b>{money(l.amount)}</b></div>
        ))}
        {!g.archived_at && <div><Btn kind="sec" sm disabled={!online} onClick={onSettle}>Settle up</Btn></div>}
      </section>
    ) : <div className="okbar"><Stroke name="check" size={18} w={3} /><span>Everyone in {g.name} is settled.</span></div>}
    <div className="list">
      {ids.map((id) => {
        const n = m.nets.get(id) ?? 0
        return <PersonRow key={id} s={s} id={id} meta={metaFor(id)} youLabel net={n} to={id === s.me ? undefined : `/friends/${id}`}
          tag={s.profiles[id].status === 'off' ? <span className="tag">Account turned off</span> : !activeMembers(s, gid).includes(id) ? <span className="tag">Left the group</span> : undefined} />
      })}
    </div>
  </>
}

export function ActRow({ s, a, withGroup }: { s: Snapshot; a: Snapshot['activity'][number]; withGroup: boolean }) {
  const nav = useNavigate()
  const ex = a.expense_id ? s.expenses.find((e) => e.id === a.expense_id) : null
  const eff = ex && a.kind === 'expense_added' && !ex.deleted_at ? myEffect(ex, s.shares, s.me) : null
  const to = a.expense_id ? `/e/${a.expense_id}` : a.payment_id ? `/p/${a.payment_id}` : a.kind === 'member_added' || a.kind === 'group_created' ? `/g/${a.group_id}` : null
  const body: ReactNode = <>
    <Av p={s.profiles[a.actor_id]} />
    <span className="et"><b style={{ whiteSpace: 'normal', fontWeight: 400, fontSize: 15 }}>{sentence(s, a, withGroup)}</b><span>{clock(a.created_at)}</span></span>
    {eff && eff.kind !== 'none' && <Amount kind={eff.kind} amount={money(eff.amount)} label={eff.kind === 'owed' ? 'you lent' : 'you owe'} />}
  </>
  return to
    ? <button type="button" className="row" style={{ alignItems: 'flex-start' }} onClick={() => nav(to)}>{body}</button>
    : <div className="row" style={{ alignItems: 'flex-start' }}>{body}</div>
}

export function Feed({ s, items, withGroup }: { s: Snapshot; items: Snapshot['activity']; withGroup: boolean }) {
  const [limit, setLimit] = useState(50)
  const out: ReactNode[] = []
  let day = ''
  for (const a of items.slice(0, limit)) {
    const d = tsDay(a.created_at)
    if (d !== day) { day = d; out.push(<div className="dayhead" key={'d' + d}>{dayLabel(d)}</div>) }
    out.push(<ActRow key={a.id} s={s} a={a} withGroup={withGroup} />)
  }
  return <div className="list">{out}
    {items.length > limit && <button type="button" className="lnk" style={{ alignSelf: 'center', margin: '12px 0' }} onClick={() => setLimit(limit + 50)}>Show older</button>}
  </div>
}

function GroupActivity({ s, gid }: { s: Snapshot; gid: string }) {
  const items = s.activity.filter((a) => a.group_id === gid).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return <Feed s={s} items={items} withGroup={false} />
}

// ---------------------------------------------------------------- B6 menu
function GroupMenu({ s, gid, close, go }: { s: Snapshot; gid: string; close: () => void; go: (o: Overlay) => void }) {
  const nav = useNavigate()
  const { write, online, showToast } = useStore()
  const g = s.groups.find((x) => x.id === gid)!
  const m = groupMoney(s, gid)
  const n = activeMembers(s, gid).length
  const myNet = m.nets.get(s.me) ?? 0
  const everyone = [...m.nets.values()].every((v) => v === 0)
  const hasMoney = s.expenses.some((e) => e.group_id === gid && !e.deleted_at) || s.payments.some((p) => p.group_id === gid && !p.deleted_at)
  const off = !online
  const leaveWhy = m.partner ? `Unlink from ${who(s, m.partner)} first` : myNet !== 0 ? `Settle your ${money(Math.abs(myNet))} first` : n <= 1 ? "You're the last member. Archive or delete it instead" : undefined
  const rows: MenuItem[] = [
    { icon: <Stroke name="pencil" />, text: 'Edit name and icon', off: off || !!g.archived_at, why: g.archived_at ? 'Reopen it first' : undefined, onClick: () => { close(); nav(`/g/${gid}/edit`) } },
    { icon: <Ph name="groups" size={20} />, text: 'Members', why: `${n} ${n === 1 ? 'person' : 'people'}`, onClick: () => { close(); nav(`/g/${gid}/members`) } },
    m.partner
      ? { icon: <Stroke name="link" />, text: `Unlink from ${who(s, m.partner)}`, why: 'Only changes what you two see', off, onClick: () => go('unlink') }
      : { icon: <Stroke name="link" />, text: 'Link a partner', why: g.archived_at ? 'Reopen it first' : 'Only you two will see it', off: off || !!g.archived_at || n < 2, onClick: () => go('link') },
    { icon: <Stroke name="leave" />, text: 'Leave group', why: leaveWhy, off: off || !!leaveWhy, onClick: () => go('leave') },
    g.archived_at
      ? { icon: <Stroke name="archive" />, text: 'Reopen group', off, onClick: async () => { close(); await write((w) => w.reopen_group(gid)); showToast({ text: `Reopened ${g.name}.` }) } }
      : { icon: <Stroke name="archive" />, text: 'Archive group', why: everyone ? undefined : 'Everyone needs to be settled first', off: off || !everyone,
          onClick: async () => { close(); try { await write((w) => w.archive_group(gid)); showToast({ text: `Archived ${g.name}.` }) } catch (e) { showToast({ text: errorText(e) }) } } },
  ]
  if (!hasMoney) rows.push({ icon: <DangerMark />, text: 'Delete group', why: 'Only while it has no expenses', danger: true, off, onClick: () => go('delete') })
  return <Sheet title={g.name} onClose={close}><MenuRows rows={rows} /></Sheet>
}

// ---------------------------------------------------------------- B11
function LinkPartner({ s, gid, close }: { s: Snapshot; gid: string; close: () => void }) {
  const { write, showToast } = useStore()
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const g = s.groups.find((x) => x.id === gid)!
  const others = activeMembers(s, gid).filter((u) => u !== s.me && s.profiles[u].status === 'active')
  return (
    <Sheet title="Link a partner" onClose={close}>
      <p className="small" style={{ color: 'var(--ink)' }}>For couples or roommates who share money. You'll see one combined balance and can settle for both of you. <b>Only you two see the link.</b> Everyone else still sees two people.</p>
      <div className="list" role="radiogroup">
        {others.map((u) => (
          <button key={u} type="button" className="row" role="radio" aria-checked={pick === u} onClick={() => setPick(u)}>
            <Av p={s.profiles[u]} /><span className="et big"><b>{nameOf(s.profiles[u], s.profiles)}</b><span>In {g.name}</span></span>
            <span className={`cb${pick === u ? ' on' : ''}`} style={{ borderRadius: '50%' }}>{pick === u && <Stroke name="check" size={16} w={3} />}</span>
          </button>
        ))}
      </div>
      {err && <span className="ferr" role="alert"><i />{err}</span>}
      <Btn kind="pri" wide disabled={!pick} busy={busy} onClick={async () => {
        setBusy(true); setErr('')
        try { await write((w) => w.link_partner(gid, pick!)); showToast({ text: `Linked with ${who(s, pick)}.` }); close() }
        catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
      }}>{pick ? `Link with ${who(s, pick)}` : 'Pick someone'}</Btn>
    </Sheet>
  )
}

function ConfirmUnlink({ s, gid, close }: { s: Snapshot; gid: string; close: () => void }) {
  const { write } = useStore()
  const [busy, setBusy] = useState(false)
  const p = groupMoney(s, gid).partner
  return <Dialog title={`Unlink from ${who(s, p)}?`} text="You'll each see your own balance again. Settled stays settled." confirm="Unlink" danger={false} busy={busy}
    onCancel={close} onConfirm={async () => { setBusy(true); try { await write((w) => w.unlink_partner(gid)) } finally { setBusy(false); close() } }} />
}

function ConfirmDelete({ gid, name, close }: { gid: string; name: string; close: () => void }) {
  const { write, showToast } = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  return <Dialog title={`Delete ${name}?`} text="It has no expenses, so nothing is lost. This can't be undone." confirm="Delete" busy={busy}
    onCancel={close} onConfirm={async () => {
      setBusy(true)
      try { await write((w) => w.delete_group(gid)); showToast({ text: `Deleted ${name}.` }); nav('/groups', { replace: true }) }
      catch (e) { showToast({ text: errorText(e) }); close() } finally { setBusy(false) }
    }} />
}

function ConfirmLeave({ gid, name, close }: { gid: string; name: string; close: () => void }) {
  const { write, showToast } = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  return <Dialog title={`Leave ${name}?`} text="You're settled here. The group and its history stay for everyone else, and you can be added back." confirm="Leave" danger={false} busy={busy}
    onCancel={close} onConfirm={async () => {
      setBusy(true)
      try { await write((w) => w.leave_group(gid)); showToast({ text: `You left ${name}.` }); nav('/groups', { replace: true }) }
      catch (e) { showToast({ text: errorText(e) }); close() } finally { setBusy(false) }
    }} />
}

// ---------------------------------------------------------------- D1 settle up
export function SettleUp({ s, gid, close }: { s: Snapshot; gid: string; close: () => void }) {
  const { write, showToast } = useStore()
  const nav = useNavigate()
  const g = s.groups.find((x) => x.id === gid)!
  const m = groupMoney(s, gid)
  const [done, setDone] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const key = (l: PlanLine) => `${l.from}>${l.to}`
  const record = async (lines: PlanLine[], k: string) => {
    setBusy(k); setErr('')
    try {
      const ids: string[] = []
      for (const l of lines) ids.push(await write((w) => w.record_payment(gid, l.from, l.to, l.amount, new Date().toISOString().slice(0, 10))))
      setDone([...done, ...lines.map(key)])
      const l = lines[0]
      showToast({
        text: lines.length > 1 ? `Recorded ${lines.length} payments.` : l.to === s.me ? `Recorded ${money(l.amount)} from ${who(s, l.from)}.` : `Recorded ${money(l.amount)} to ${who(s, l.to)}.`,
        action: 'Undo', onAction: async () => { for (const id of ids) await write((w) => w.delete_payment(id)); setDone((d) => d.filter((x) => !lines.map(key).includes(x))) },
      })
    } catch (e) { setErr(errorText(e, { group: g.name })) } finally { setBusy(null) }
  }
  const lines = m.myLines
  const us = new Set([s.me, ...(m.partner ? [m.partner] : [])])
  // "Settle for both of us" only when every line points the same way (S-23 mixed case).
  const sameWay = m.partner && lines.length > 1 && (lines.every((l) => us.has(l.to)) || lines.every((l) => us.has(l.from)))
  const name = (u: string, other: string) => (u === s.me ? (other === s.me ? 'You' : 'you') : who(s, u))
  return (
    <Sheet title="Settle up" onClose={close}>
      <p className="cap">{g.name} · <b>Recorded only · no money moves</b></p>
      {lines.length === 0 ? <>
        <Empty kind="sun" title="You're settled here" text="Nobody owes you and you owe nobody in this group." style={{ padding: '8px 0' }} />
      </> : <>
        {sameWay && <div className="note" style={{ flexDirection: 'column', gap: 8 }}>
          <span>You and {who(s, m.partner)} are linked. Record both payments in one tap.</span>
          <Btn kind="pri" wide busy={busy === 'both'} disabled={lines.every((l) => done.includes(key(l)))}
            onClick={() => record(lines.filter((l) => !done.includes(key(l))), 'both')}>Settle for both of us</Btn>
        </div>}
        <div className="list">
          {lines.map((l) => {
            const k = key(l), isDone = done.includes(k)
            return (
              <div className="row" key={k} style={isDone ? { opacity: 0.55 } : undefined}>
                <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}
                  onClick={() => { close(); nav(`/g/${gid}/pay?from=${l.from}&to=${l.to}&amount=${l.amount}`) }} disabled={isDone}>
                  <span className="stack"><Av p={s.profiles[l.from]} size={32} /><Av p={s.profiles[l.to]} size={32} /></span>
                  <span className="et"><b style={isDone ? { textDecoration: 'line-through' } : undefined}>{l.from === s.me ? 'You pay' : `${who(s, l.from)} pays`} {name(l.to, l.from)}</b>
                    <span>{money(l.amount)} · tap to pay part</span></span>
                </button>
                {isDone ? <span className="rl" style={{ color: 'var(--hunter)' }}>Recorded</span>
                  : <Btn kind="pri" sm busy={busy === k} onClick={() => record([l], k)}>Record</Btn>}
              </div>
            )
          })}
        </div>
      </>}
      {err && <span className="ferr" role="alert"><i />{err}</span>}
      <button type="button" className="lnk" style={{ alignSelf: lines.length ? 'flex-start' : 'center' }} onClick={() => { close(); nav(`/g/${gid}/pay`) }}>Other payment</button>
    </Sheet>
  )
}

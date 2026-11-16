// D2 record (or edit) a payment, D3 payment detail.
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useSnap, useStore, errorText } from '../data/store.tsx'
import type { Snapshot } from '../data/types.ts'
import { activeMembers, clock, groupMoney, isMember, MAX_CENTS, money, nameOf, parseCents, partnerOf, shortDay, today, tsDay } from '../data/logic.ts'
import { Av, Btn, Label, PayTile, Sheet, Stroke, TopBar } from '../ui/kit.tsx'
import { useBack } from '../ui/nav.ts'
import { NotInGroup } from './group.tsx'
import { paymentTitle } from './common.tsx'
import { who } from '../ui/words.tsx'
import { DatePick as DatePickPublic } from './expense.tsx'

export function RecordPayment({ edit }: { edit?: boolean }) {
  const s = useSnap()
  const { gid, pid } = useParams()
  const pay = edit ? s.payments.find((p) => p.id === pid) : undefined
  const groupId = pay?.group_id ?? gid
  const g = s.groups.find((x) => x.id === groupId)
  if (!g || !isMember(s, g.id) || (edit && !pay)) return <NotInGroup />
  return <PayForm s={s} gid={g.id} pid={pay?.id} />
}

function PayForm({ s, gid, pid }: { s: Snapshot; gid: string; pid?: string }) {
  const [q] = useSearchParams()
  const { write, showToast, online } = useStore()
  const nav = useNavigate()
  const pay = pid ? s.payments.find((p) => p.id === pid)! : undefined
  const g = s.groups.find((x) => x.id === gid)!
  const close = useBack(pay ? `/p/${pay.id}` : `/g/${gid}`)
  const partner = partnerOf(s, gid)
  const [from, setFrom] = useState<string | null>(pay?.from_user ?? q.get('from'))
  const [to, setTo] = useState<string | null>(pay?.to_user ?? q.get('to'))
  const [amount, setAmount] = useState(pay ? (pay.amount_cents / 100).toFixed(2) : q.get('amount') ? (Number(q.get('amount')) / 100).toFixed(2) : '')
  const [date, setDate] = useState(pay?.paid_on ?? today())
  const [pickDate, setPickDate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const free = !pay && !(q.get('from') && q.get('to'))

  // "Other payment": pick the other person and the direction.
  const [dir, setDir] = useState<'paid' | 'got'>('paid')
  const [other, setOther] = useState<string | null>(null)
  const others = activeMembers(s, gid).filter((u) => u !== s.me)
  const f = free ? (other ? (dir === 'paid' ? s.me : other) : null) : from
  const t = free ? (other ? (dir === 'paid' ? other : s.me) : null) : to
  void setFrom; void setTo

  const cents = parseCents(amount) ?? 0
  const plan = groupMoney(s, gid).plan.find((l) => l.from === f && l.to === t)?.amount ?? 0
  const overBy = f && t && cents > plan ? cents - plan : 0
  const whole = amount ? (amount.includes('.') ? amount.split('.')[0] : amount) || '0' : '0'
  const dec = amount.includes('.') ? (amount.split('.')[1] + '00').slice(0, 2) : '00'
  const isMine = (u: string | null) => u === s.me || (partner !== null && u === partner)

  const save = async () => {
    if (!f || !t) { setErr('Pick who paid whom.'); return }
    if (cents < 1 || cents > MAX_CENTS) { setErr('Enter an amount from $0.01 to $99,999.99.'); return }
    setBusy(true); setErr('')
    try {
      if (pay) {
        await write((w) => w.update_payment(pay.id, pay.version, cents, date))
        showToast({ text: 'Saved changes.' }); close()
      } else {
        const id = await write((w) => w.record_payment(gid, f, t, cents, date))
        showToast({ text: `Recorded ${money(cents)}.`, action: 'Undo', onAction: () => write((w) => w.delete_payment(id)) })
        nav(`/g/${gid}`, { replace: true })
      }
    } catch (x) { setErr(errorText(x, { group: g.name })) } finally { setBusy(false) }
  }

  const fName = (u: string) => (u === s.me ? 'you' : nameOf(s.profiles[u], s.profiles))
  return <>
    <TopBar left="back" title={pay ? 'Edit payment' : 'Record payment'} onLeft={close} />
    {free ? <>
      <div className="seg" role="tablist" aria-label="Direction" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <button type="button" className={dir === 'paid' ? 'on' : ''} role="tab" aria-selected={dir === 'paid'} onClick={() => setDir('paid')}>I paid</button>
        <button type="button" className={dir === 'got' ? 'on' : ''} role="tab" aria-selected={dir === 'got'} onClick={() => setDir('got')}>I was paid</button>
      </div>
      <div className="fld"><Label>{dir === 'paid' ? 'Who did you pay?' : 'Who paid you?'}</Label>
        <div className="list" role="radiogroup">{others.map((u) => (
          <button key={u} type="button" className="row tight" role="radio" aria-checked={other === u} onClick={() => setOther(u)}>
            <Av p={s.profiles[u]} /><span className="et big"><b>{nameOf(s.profiles[u], s.profiles)}</b></span>
            <span className={`cb${other === u ? ' on' : ''}`} style={{ borderRadius: '50%' }}>{other === u && <Stroke name="check" size={16} w={3} />}</span>
          </button>))}</div></div>
    </> : f && t && <div className="note" style={{ alignItems: 'center', gap: 12 }}>
      <Av p={s.profiles[f]} /><Stroke name="arrow" size={20} /><Av p={s.profiles[t]} />
      <span style={{ flex: 1 }}><b>{f === s.me ? 'You' : nameOf(s.profiles[f], s.profiles)}</b> paid <b>{fName(t)}</b><span className="cap" style={{ display: 'block' }}>in {g.name}</span></span>
    </div>}
    <div className="bigamt" role="group" aria-label="Amount">
      <span className={`bamt${amount ? '' : ' blank'}`} aria-hidden="true"><span className="dol">$</span>{Number(whole).toLocaleString('en-US')}<span className="dec">.{dec}</span></span>
      <span className="bline" />
      <input inputMode="decimal" aria-label="Amount in dollars" value={amount}
        onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) setAmount(v) }} />
    </div>
    {!pay && overBy > 0 && <div className="warn"><span><b>{money(overBy)} more than {plan ? `${f === s.me ? 'you owe' : who(s, f) + ' owes'} ${t === s.me ? 'you' : who(s, t, false)}` : 'the plan says'} here.</b> You can still record it; {t === s.me ? 'you' : who(s, t)} will then owe {money(overBy)} back.</span></div>}
    <div className="chips"><button type="button" className="chip" onClick={() => setPickDate(true)}><Stroke name="cal" size={22} />
      <span><span className="k">Date</span><b>{date === today() ? 'Today' : shortDay(date)}</b></span></button></div>
    <p className="cap">Recorded only · no money moves.</p>
    {f && t && !isMine(f) && !isMine(t) && <span className="ferr"><i />Only the two people in a payment can record it.</span>}
    {err && <span className="ferr" role="alert"><i />{err}</span>}
    <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide busy={busy} disabled={!online || !cents || !f || !t} onClick={save}>
      {pay ? 'Save changes' : cents ? `Record ${money(cents)}` : 'Record payment'}</Btn></div>
    {pickDate && <Sheet title="Date" onClose={() => setPickDate(false)}><DatePickPublic value={date} onPick={(d) => { setDate(d); setPickDate(false) }} /></Sheet>}
  </>
}

export function PaymentDetail() {
  const s = useSnap()
  const { pid } = useParams()
  const nav = useNavigate()
  const { write, showToast, online } = useStore()
  const p = s.payments.find((x) => x.id === pid)
  const g = p && s.groups.find((x) => x.id === p.group_id)
  const back = useBack(g ? `/g/${g.id}` : '/groups')
  const [busy, setBusy] = useState(false)
  if (!p || !g) return <NotInGroup />
  const partner = partnerOf(s, g.id)
  const mine = [s.me, partner].includes(p.from_user) || [s.me, partner].includes(p.to_user)
  const archived = !!g.archived_at
  return <>
    <TopBar left="back" onLeft={back} />
    {p.deleted_at && <span className="stamp red">Deleted</span>}
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><PayTile size={56} />
      <span className="et"><b style={{ fontSize: 20, fontFamily: 'var(--display)', whiteSpace: 'normal' }}>{paymentTitle(s, p)}</b>
        <span>{g.name} · {shortDay(p.paid_on)}</span></span></div>
    <span className="damt" style={{ color: 'var(--hunter)', opacity: p.deleted_at ? 0.6 : 1 }}>{money(p.amount_cents)}</span>
    <p style={{ color: 'var(--ink)' }}>Recorded by {who(s, p.created_by, false)} on {shortDay(tsDay(p.created_at))} at {clock(p.created_at)}.
      {p.updated_at && ` Changed by ${who(s, p.updated_by, false)} on ${shortDay(tsDay(p.updated_at))}.`}</p>
    <div className="note"><Stroke name="handshake" size={20} /><span>Recorded only. No money moved in the app.</span></div>
    <p className="cap">{mine ? 'Either of you can edit or delete this. Every change is logged.' : 'Only the two people in this payment can change it.'}</p>
    {p.deleted_at && mine && !archived && <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide icon={<Stroke name="undo" size={18} />} busy={busy} disabled={!online}
      onClick={async () => { setBusy(true); try { await write((w) => w.restore_payment(p.id)) } finally { setBusy(false) } }}>Restore payment</Btn></div>}
    {!p.deleted_at && mine && !archived && <>
      <div className="actbar">
        <Btn kind="dan" wide icon={<Stroke name="trash" size={18} />} busy={busy} disabled={!online} onClick={async () => {
          setBusy(true)
          try {
            await write((w) => w.delete_payment(p.id)); nav(`/g/${g.id}`, { replace: true })
            showToast({ text: `Deleted a ${money(p.amount_cents)} payment.`, action: 'Undo', onAction: () => write((w) => w.restore_payment(p.id)) })
          } catch (x) { showToast({ text: errorText(x) }) } finally { setBusy(false) }
        }}>Delete</Btn>
        <Btn kind="sec" wide icon={<Stroke name="pencil" size={18} />} disabled={!online} onClick={() => nav(`/p/${p.id}/edit`)}>Edit</Btn>
      </div>
      <div style={{ height: 90, flexShrink: 0 }} />
    </>}
  </>
}

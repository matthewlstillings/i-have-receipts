// C · Expenses: C1 add, C2 edit (conflict), C3 category, C4 paid by, C6 split,
// C7 date, C5 detail, C8 changes, C9 deleted.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSnap, useStore, errorText } from '../data/store.tsx'
import type { Category, Expense, ExpenseInput, Snapshot, SplitMethod } from '../data/types.ts'
import { AppError } from '../data/types.ts'
import {
  activeMembers, CAT_NAME, CATEGORIES, clock, evenSplit, guessCategory, isMember, iso, longDay, MAX_CENTS, METHOD_NAME,
  money, MONTHS, myEffect, nameOf, parseCents, parseDay, parsePct, pctText, shortDay, today, tsDay, ago,
} from '../data/logic.ts'
import { Av, Bold, Btn, CalDuo, Label, Mk, Mis, Next, Sheet, Stroke, Tile, TopBar } from '../ui/kit.tsx'
import { useBack } from '../ui/nav.ts'
import { NotInGroup } from './group.tsx'
import { changes, who } from '../ui/words.tsx'

// ---------------------------------------------------------------- split model
interface Split {
  method: SplitMethod
  on: string[]                        // equal: who is in it
  exact: Record<string, string>       // typed dollar text per person (untyped share the rest)
  pct: Record<string, string>         // typed percent text per person
}

interface Resolved { users: string[]; cents: Record<string, number>; auto: Set<string>; left: number; ok: boolean; pctLeft?: number; bp?: Record<string, number> }

/** Works out each person's cents for the current split, and whether it adds up (R-07, R-09). */
function resolve(sp: Split, people: string[], total: number): Resolved {
  if (sp.method === 'equal') {
    const users = people.filter((u) => sp.on.includes(u))
    const parts = evenSplit(total, users.length)
    return { users, cents: Object.fromEntries(users.map((u, i) => [u, parts[i]])), auto: new Set(), left: 0, ok: users.length > 0 }
  }
  if (sp.method === 'exact') {
    const typed: Record<string, number> = {}
    for (const u of people) if (sp.exact[u] != null && sp.exact[u] !== '') typed[u] = parseCents(sp.exact[u]) ?? 0
    const autoU = people.filter((u) => !(u in typed))
    const typedSum = Object.values(typed).reduce((a, b) => a + b, 0)
    const rest = total - typedSum
    const parts = autoU.length && rest >= 0 ? evenSplit(rest, autoU.length) : autoU.map(() => 0)
    const cents: Record<string, number> = { ...typed }
    autoU.forEach((u, i) => { cents[u] = parts[i] })
    const left = autoU.length && rest >= 0 ? 0 : rest
    const users = people.filter((u) => cents[u] > 0)
    return { users, cents, auto: new Set(autoU), left, ok: left === 0 && users.length > 0 }
  }
  const typed: Record<string, number> = {}
  for (const u of people) if (sp.pct[u] != null && sp.pct[u] !== '') typed[u] = parsePct(sp.pct[u]) ?? 0
  const autoU = people.filter((u) => !(u in typed))
  const rest = 10000 - Object.values(typed).reduce((a, b) => a + b, 0)
  const parts = autoU.length && rest >= 0 ? evenSplit(rest, autoU.length) : autoU.map(() => 0)
  const bp: Record<string, number> = { ...typed }
  autoU.forEach((u, i) => { bp[u] = parts[i] })
  const pctLeft = autoU.length && rest >= 0 ? 0 : rest
  const users = people.filter((u) => bp[u] > 0)
  // cents shown next to each percent, using the same leftover rule as the database
  const raw = users.map((u) => Math.floor((total * bp[u]) / 10000))
  let rem = total - raw.reduce((a, b) => a + b, 0)
  for (let i = 0; rem > 0 && users.length; i = (i + 1) % users.length) { raw[i] += 1; rem -= 1 }
  const cents: Record<string, number> = Object.fromEntries(people.map((u) => [u, 0]))
  users.forEach((u, i) => { cents[u] = raw[i] })
  return { users, cents, auto: new Set(autoU), left: 0, pctLeft, bp, ok: pctLeft === 0 && users.length > 0 }
}

function splitFromExpense(e: Expense, shares: Snapshot['shares']): Split {
  const mine = shares.filter((s) => s.expense_id === e.id)
  return {
    method: e.split_method,
    on: mine.filter((s) => s.amount_cents > 0).map((s) => s.user_id),
    exact: e.split_method === 'exact' ? Object.fromEntries(mine.map((s) => [s.user_id, ((s.exact_cents ?? s.amount_cents) / 100).toFixed(2)])) : {},
    pct: e.split_method === 'percent' ? Object.fromEntries(mine.map((s) => [s.user_id, pctText(s.percent_bp ?? 0)])) : {},
  }
}

// ---------------------------------------------------------------- C1 / C2
type Over = null | 'category' | 'paid' | 'date'

export function ExpenseForm({ edit }: { edit?: boolean }) {
  const s = useSnap()
  const { gid, eid } = useParams()
  const ex = edit ? s.expenses.find((e) => e.id === eid) : undefined
  const groupId = ex?.group_id ?? gid
  const g = s.groups.find((x) => x.id === groupId)
  if (!g || !isMember(s, g.id) || (edit && !ex)) return <NotInGroup />
  return <Form s={s} g={g.id} ex={ex} />
}

function Form({ s, g, ex }: { s: Snapshot; g: string; ex?: Expense }) {
  const { write, refresh, showToast, online } = useStore()
  const nav = useNavigate()
  const group = s.groups.find((x) => x.id === g)!
  const close = useBack(ex ? `/e/${ex.id}` : `/g/${g}`)
  // Everyone who can be in the split: active members, plus anyone already on this expense (S-04).
  const people = useMemo(() => {
    const act = activeMembers(s, g).filter((u) => s.profiles[u].status === 'active')
    const already = ex ? s.shares.filter((x) => x.expense_id === ex.id).map((x) => x.user_id) : []
    const all = [...new Set([...act, ...already])]
    return all.sort((a, b) => (a === s.me ? -1 : b === s.me ? 1 : s.profiles[a].display_name.localeCompare(s.profiles[b].display_name)))
  }, [s, g, ex])

  const [amount, setAmount] = useState(ex ? (ex.amount_cents / 100).toFixed(2) : '')
  const [desc, setDesc] = useState(ex?.description ?? '')
  const [cat, setCat] = useState<Category>(ex?.category ?? 'uncategorized')
  const [picked, setPicked] = useState(ex?.category_picked ?? false)
  const [paid, setPaid] = useState(ex?.paid_by ?? s.me)
  const [date, setDate] = useState(ex?.spent_on ?? today())
  const [notes, setNotes] = useState(ex?.notes ?? '')
  const [showNote, setShowNote] = useState(!!ex?.notes)
  const [split, setSplit] = useState<Split>(() => ex ? splitFromExpense(ex, s.shares) : { method: 'equal', on: people, exact: {}, pct: {} })
  const [splitting, setSplitting] = useState(false)
  const [over, setOver] = useState<Over>(null)
  const [errs, setErrs] = useState<{ amount?: string; desc?: string }>({})
  const [fail, setFail] = useState<null | 'offline' | 'archived' | 'conflict' | string>(null)
  const [conflictBy, setConflictBy] = useState('')
  const [version, setVersion] = useState(ex?.version ?? 1)
  const [busy, setBusy] = useState(false)

  const cents = parseCents(amount) ?? 0
  const guess = guessCategory(desc)
  const guessed = picked ? cat : guess
  const shownCat = picked ? cat : guess !== 'uncategorized' ? guess : cat
  const r = resolve(split, people, cents)

  if (splitting) return <SplitStep s={s} people={people} total={cents} split={split} payer={paid}
    onBack={() => setSplitting(false)} onDone={(sp) => { setSplit(sp); setSplitting(false) }} />

  const blank = !amount && !desc
  const save = async (reopenFirst = false, useVersion = version) => {
    const e: typeof errs = {}
    if (cents < 1 || cents > MAX_CENTS) e.amount = 'Enter an amount from $0.01 to $99,999.99.'
    if (!desc.trim()) e.desc = 'Add a short description.'
    else if (desc.trim().length > 60) e.desc = 'Keep it to 60 characters.'
    setErrs(e)
    if (e.amount || e.desc) return
    if (!r.ok) { setSplitting(true); return }
    if (r.users.length === 1 && r.users[0] === paid) { setSplitting(true); return }
    const input: ExpenseInput = {
      group: g, description: desc.trim(), amount_cents: cents, category: shownCat, category_picked: picked, paid_by: paid,
      method: split.method, users: r.users,
      pct: split.method === 'percent' ? r.users.map((u) => r.bp![u]) : null,
      exact: split.method === 'exact' ? r.users.map((u) => r.cents[u]) : null,
      spent_on: date, notes: notes.trim() || null,
    }
    setBusy(true); setFail(null)
    try {
      if (reopenFirst) await write((w) => w.reopen_group(g))
      if (ex) {
        await write((w) => w.update_expense(ex.id, useVersion, input))
        showToast({ text: 'Saved changes.' })
        close()
      } else {
        const id = await write((w) => w.create_expense(input))
        showToast({ text: `Added ${input.description}.` })
        nav(`/g/${g}`, { replace: true, state: { flash: id } })
      }
    } catch (x) {
      const err = x as AppError
      if (err.code === 'offline') setFail('offline')
      else if (err.code === 'group_archived') setFail('archived')
      else if (err.code === 'version_conflict') { setFail('conflict'); setConflictBy(err.arg); await refresh() }
      else setFail(errorText(err, { group: group.name }))
    } finally { setBusy(false) }
  }
  const keepMine = () => {
    const latest = s.expenses.find((e) => e.id === ex?.id)
    if (latest) { setVersion(latest.version); save(false, latest.version) }
  }

  const whole = amount ? (amount.includes('.') ? amount.split('.')[0] : amount) || '0' : '0'
  const dec = amount.includes('.') ? (amount.split('.')[1] + '00').slice(0, 2) : '00'
  const splitPeople = r.users.length
  const splitText = `${METHOD_NAME[split.method]} · ${splitPeople} ${splitPeople === 1 ? 'person' : 'people'}`
  const stack = r.users.filter((u) => u !== s.me).slice(0, 2)

  return <>
    <TopBar left="close" title={ex ? 'Edit expense' : 'Add expense'} onLeft={close} />
    {fail === 'conflict' && <div className="warn" style={{ flexDirection: 'column', gap: 8 }}>
      <span><b>{conflictBy || 'Someone'} changed this while you were editing.</b> Your changes are still here.</span>
      <div style={{ display: 'flex', gap: 8 }}><Btn kind="txt" sm onClick={close}>See their version</Btn><Btn kind="sec" sm busy={busy} onClick={keepMine}>Keep mine</Btn></div>
    </div>}
    <span className="label ctx">In {group.name}</span>
    <div className="bigamt" role="group" aria-label="Amount">
      <span className={`bamt${amount ? '' : ' blank'}`} aria-hidden="true"><span className="dol">$</span>{Number(whole).toLocaleString('en-US')}<span className="dec">.{dec}</span></span>
      <span className="bline" />
      <input inputMode="decimal" aria-label="Amount in dollars" value={amount} autoFocus={!ex}
        onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) { setAmount(v); setErrs({ ...errs, amount: undefined }) } }} />
      {errs.amount && <span className="ferr"><i />{errs.amount}</span>}
    </div>
    <label className="fld"><Label>Description</Label>
      <span className={`fbox${errs.desc ? ' err' : ''}`}><input value={desc} maxLength={60} placeholder="What was it?"
        onChange={(e) => { setDesc(e.target.value); setErrs({ ...errs, desc: undefined }) }} aria-invalid={!!errs.desc} /></span>
      {errs.desc && <span className="ferr"><i />{errs.desc}</span>}
    </label>
    <div className="chips">
      <button type="button" className={`chip${!picked && guessed !== 'uncategorized' ? ' guess' : ''}`} onClick={() => setOver('category')}>
        <Tile cat={shownCat} size={28} /><span><span className="k">Category</span><b>{CAT_NAME[shownCat]}</b></span></button>
      <button type="button" className="chip" onClick={() => setOver('paid')}>
        <Av p={s.profiles[paid]} size={28} /><span><span className="k">Paid by</span><b>{paid === s.me ? 'You' : nameOf(s.profiles[paid], s.profiles)}</b></span></button>
      <button type="button" className="chip" onClick={() => setSplitting(true)}>
        <span className="stack">{(stack.length ? stack : [s.me]).map((u) => <Av key={u} p={s.profiles[u]} size={28} />)}</span>
        <span><span className="k">Split</span><b>{splitText}</b></span></button>
      <button type="button" className="chip" onClick={() => setOver('date')}>
        <Stroke name="cal" size={22} /><span><span className="k">Date</span><b>{date === today() ? 'Today' : shortDay(date)}</b></span></button>
    </div>
    {!picked && guessed !== 'uncategorized' && <span className="cap">Category guessed from the description.</span>}
    {!r.ok && cents > 0 && <span className="ferr"><i />The split doesn't add up any more. Open Split to fix it.</span>}
    {showNote
      ? <label className="fld"><Label>Note</Label><span className="fbox area"><textarea value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to remember" /></span>
        <span className="count">{notes.length} / 280</span></label>
      : <button type="button" className="lnk" style={{ alignSelf: 'flex-start', textAlign: 'left', display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={() => setShowNote(true)}><Stroke name="note" size={16} /> Add a note</button>}
    {fail === 'offline' && <div className="note" style={{ boxShadow: 'inset 0 0 0 2px var(--red)' }}><b className="mk" style={{ background: 'var(--red)', marginTop: 6 }} />
      <span>Couldn't save. Check your connection and try again. Nothing you typed was lost.</span></div>}
    {fail && !['offline', 'archived', 'conflict'].includes(fail) && <span className="ferr" role="alert"><i />{fail}</span>}
    {fail === 'archived'
      ? <>
        <div className="warn"><span><b>{group.name} was archived</b> while you were typing. Reopen it to {ex ? 'save this change' : 'add this expense'}.</span></div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Btn kind="sec" wide busy={busy} onClick={() => save(true)}>Reopen and save</Btn>
          <Btn kind="txt" wide onClick={close}>Discard</Btn>
        </div>
      </>
      : fail !== 'conflict' && <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide disabled={blank || !online} busy={busy} onClick={() => save()}>{ex ? 'Save changes' : 'Save expense'}</Btn></div>}

    {over === 'category' && <Sheet title="Category" onClose={() => setOver(null)}>
      <div className="list">{CATEGORIES.map((c) => (
        <button key={c} type="button" className="row tight" aria-pressed={c === shownCat} onClick={() => { setCat(c); setPicked(true); setOver(null) }}>
          <Tile cat={c} /><span className="et big"><b>{CAT_NAME[c]}</b></span>{c === shownCat && <Stroke name="check" size={20} w={3} />}
        </button>))}</div>
    </Sheet>}
    {over === 'paid' && <Sheet title="Paid by" onClose={() => setOver(null)}>
      <div className="list" role="radiogroup">{people.filter((u) => s.profiles[u].status === 'active' || u === paid).map((u) => (
        <button key={u} type="button" className="row tight" role="radio" aria-checked={u === paid} onClick={() => { setPaid(u); setOver(null) }}>
          <Av p={s.profiles[u]} /><span className="et big"><b>{u === s.me ? 'You' : nameOf(s.profiles[u], s.profiles)}</b></span>{u === paid && <Stroke name="check" size={20} w={3} />}
        </button>))}</div>
      <p className="cap">Paying for a friend whose phone died? Pick them; it's logged as added by you.</p>
    </Sheet>}
    {over === 'date' && <Sheet title="Date" onClose={() => setOver(null)}><DatePick value={date} onPick={(d) => { setDate(d); setOver(null) }} /></Sheet>}
  </>
}

// ---------------------------------------------------------------- C6 split
function SplitStep({ s, people, total, split, payer, onBack, onDone }: {
  s: Snapshot; people: string[]; total: number; split: Split; payer: string; onBack: () => void; onDone: (sp: Split) => void
}) {
  const [sp, setSp] = useState<Split>(split)
  const r = resolve(sp, people, total)
  const nm = (u: string) => (u === s.me ? 'You' : nameOf(s.profiles[u], s.profiles))
  const onlyPayer = r.users.length === 1 && r.users[0] === payer
  const setMethod = (m: SplitMethod) => setSp({ ...sp, method: m, ...(m === 'equal' && sp.on.length === 0 ? { on: people } : {}) })

  let body: React.ReactNode, status: React.ReactNode
  if (sp.method === 'equal') {
    const each = r.users.length ? Math.floor(total / r.users.length) : 0
    const uneven = r.users.length && total % r.users.length !== 0
    body = <>
      <div className="shead"><span className="label">Split between · {r.users.length} of {people.length}</span>
        <button type="button" className="lnk" onClick={() => setSp({ ...sp, on: sp.on.length === people.length ? [s.me] : people })}>{sp.on.length === people.length ? 'Just me' : 'Everyone'}</button></div>
      <div className="agrid">{people.map((u) => {
        const on = sp.on.includes(u)
        return <button key={u} type="button" className={`atog${on ? '' : ' no'}`} aria-pressed={on}
          onClick={() => setSp({ ...sp, on: on ? sp.on.filter((x) => x !== u) : [...sp.on, u] })}>
          <Av p={s.profiles[u]} size={56} off={!on} />{on && <span className="chk"><Stroke name="check" size={14} w={3} /></span>}<b>{nm(u)}</b></button>
      })}</div>
    </>
    status = r.users.length === 0 ? <span className="ferr"><i />Pick at least one person.</span>
      : onlyPayer ? <span className="ferr"><i />Only {payer === s.me ? 'you are' : `${nm(payer)} is`} in it, so nobody owes anything. Add someone else.</span>
        : <div className="okbar"><Stroke name="check" size={18} w={3} /><span>{uneven ? 'About ' : ''}{money(each)} each · adds up to {money(total)}</span></div>
  } else if (sp.method === 'exact') {
    body = <>
      <p className="cap">Starts split equally. Type an amount to set someone; anyone you haven't typed shares what's left. Type 0 to leave someone out.</p>
      <div className="list">{people.map((u) => {
        const auto = r.auto.has(u), zero = !auto && r.cents[u] === 0
        return <div key={u} className="exr" style={zero ? { opacity: 0.6 } : undefined}>
          <Av p={s.profiles[u]} size={32} />
          <span className="et"><b>{nm(u)}</b>{auto ? <span>Shares the rest</span> : zero ? <span>Not in it</span> : null}</span>
          <span className={`exin${auto ? ' auto' : ''}`}><em>$</em>
            <input inputMode="decimal" aria-label={`${nm(u)}'s amount`} placeholder={((r.cents[u] ?? 0) / 100).toFixed(2)}
              value={sp.exact[u] ?? ''} onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, '')
                if (/^\d{0,5}(\.\d{0,2})?$/.test(v)) { const x = { ...sp.exact }; if (v === '') delete x[u]; else x[u] = v; setSp({ ...sp, exact: x }) }
              }} /></span>
        </div>
      })}</div>
    </>
    const out = people.filter((u) => !r.auto.has(u) && r.cents[u] === 0)
    status = r.left > 0 ? <div className="warn"><span><b>{money(r.left)} left to split.</b> Add it to someone's amount until it adds up to {money(total)}.</span></div>
      : r.left < 0 ? <div className="warn"><span><b>{money(-r.left)} over the total.</b> Lower an amount until it adds up to {money(total)}.</span></div>
        : onlyPayer ? <span className="ferr"><i />Only {nm(payer)} {payer === s.me ? 'are' : 'is'} in it, so nobody owes anything.</span>
          : <div className="okbar"><Stroke name="check" size={18} w={3} /><span>Adds up to {money(total)}{out.length ? ` · ${out.map(nm).join(', ')} not in it` : ''}</span></div>
  } else {
    body = <>
      <p className="cap">Starts split equally. Type a percent to set someone; anyone you haven't typed shares what's left. Type 0 to leave someone out.</p>
      <div className="list">{people.map((u) => {
        const auto = r.auto.has(u), zero = (r.bp?.[u] ?? 0) === 0
        return <div key={u} className="exr" style={zero && !auto ? { opacity: 0.6 } : undefined}>
          <Av p={s.profiles[u]} size={32} />
          <span className="et"><b>{nm(u)}</b><span>{zero ? 'Not in it' : `${money(r.cents[u])}${auto ? ' · shares the rest' : ''}`}</span></span>
          <span className={`exin pct${auto ? ' auto' : ''}`}>
            <input inputMode="decimal" aria-label={`${nm(u)}'s percent`} placeholder={pctText(r.bp?.[u] ?? 0)}
              value={sp.pct[u] ?? ''} onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, '')
                if (/^\d{0,3}(\.\d{0,2})?$/.test(v)) { const x = { ...sp.pct }; if (v === '') delete x[u]; else x[u] = v; setSp({ ...sp, pct: x }) }
              }} /><em>%</em></span>
        </div>
      })}</div>
    </>
    const left = r.pctLeft ?? 0
    status = left > 0 ? <div className="warn"><span><b>{pctText(left)}% left to split ({money(Math.round((total * left) / 10000))}).</b> Add it to someone's percent until it reaches 100%.</span></div>
      : left < 0 ? <div className="warn"><span><b>{pctText(-left)}% over 100%.</b> Lower a percent until it adds up to 100%.</span></div>
        : onlyPayer ? <span className="ferr"><i />Only {nm(payer)} {payer === s.me ? 'are' : 'is'} in it, so nobody owes anything.</span>
          : <div className="okbar"><Stroke name="check" size={18} w={3} /><span>100% · adds up to {money(total)}</span></div>
  }
  return <>
    <TopBar left="back" title={total ? `Split ${money(total)}` : 'Split'} onLeft={onBack} />
    <div className="seg" role="tablist" aria-label="Split method">
      {(['equal', 'exact', 'percent'] as SplitMethod[]).map((m) => (
        <button key={m} type="button" role="tab" aria-selected={sp.method === m} className={sp.method === m ? 'on' : ''} onClick={() => setMethod(m)}>{METHOD_NAME[m]}</button>
      ))}
    </div>
    {total === 0 && <p className="cap">Enter the amount first to see each share.</p>}
    {body}{status}
    <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide disabled={!r.ok || onlyPayer} onClick={() => onDone(sp)}>Done</Btn></div>
  </>
}

// ---------------------------------------------------------------- C7 date
export function DatePick({ value, onPick }: { value: string; onPick: (d: string) => void }) {
  const t = today()
  const [view, setView] = useState(() => { const d = parseDay(value); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const y = view.getFullYear(), m = view.getMonth()
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const tNow = parseDay(t)
  const nextOff = y > tNow.getFullYear() || (y === tNow.getFullYear() && m >= tNow.getMonth())
  return <>
    <div className="fld"><div className="dsfield" style={{ cursor: 'default' }}><CalDuo /><span>{longDay(value)}</span><Bold name="down" size={16} /></div></div>
    <div className="dscal">
      <div className="dsband">
        <button type="button" className="ib sm" aria-label={MONTHS[(m + 11) % 12]} onClick={() => setView(new Date(y, m - 1, 1))}><Bold name="back" size={16} /></button>
        <b className="mis" data-t={`${MONTHS[m]}${y !== tNow.getFullYear() ? ' ' + y : ''}`}>{MONTHS[m]}{y !== tNow.getFullYear() ? ` ${y}` : ''}</b>
        <button type="button" className="ib sm" aria-label={MONTHS[(m + 1) % 12]} disabled={nextOff} style={nextOff ? { opacity: 0.35 } : undefined}
          onClick={() => setView(new Date(y, m + 1, 1))}><Next /></button>
      </div>
      <div className="dgrid">
        {'SMTWTFS'.split('').map((d, i) => <span className="dow" key={i}>{d}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={'b' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = iso(new Date(y, m, i + 1))
          const fut = d > t
          const cls = `day${d === t ? ' today' : ''}${d === value ? ' sel' : ''}${fut ? ' fut' : ''}`
          return <button key={d} type="button" className={cls} aria-disabled={fut || undefined} aria-pressed={d === value}
            aria-label={longDay(d)} onClick={() => !fut && onPick(d)}>{i + 1}</button>
        })}
      </div>
    </div>
    <p className="cap">Future days are off: log expenses once they're paid.</p>
  </>
}

// ---------------------------------------------------------------- C5 / C9 detail
export function ExpenseDetail() {
  const s = useSnap()
  const { eid } = useParams()
  const nav = useNavigate()
  const { write, showToast, online } = useStore()
  const e = s.expenses.find((x) => x.id === eid)
  const g = e && s.groups.find((x) => x.id === e.group_id)
  const back = useBack(g ? `/g/${g.id}` : '/groups')
  const [busy, setBusy] = useState(false)
  if (!e || !g) return <NotInGroup />
  const shares = s.shares.filter((x) => x.expense_id === e.id && x.amount_cents > 0)
    .sort((a, b) => (a.user_id === s.me ? -1 : b.user_id === s.me ? 1 : b.amount_cents - a.amount_cents))
  const eff = myEffect(e, s.shares, s.me)
  const edits = s.activity.filter((a) => a.expense_id === e.id && a.kind === 'expense_edited').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const archived = !!g.archived_at
  const method = e.split_method === 'equal' ? `split equally between ${shares.length}` : e.split_method === 'exact' ? 'split by exact amounts' : 'split by percent'

  if (e.deleted_at) return <>
    <TopBar left="back" onLeft={back} />
    <span className="stamp red">Deleted</span>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', opacity: 0.7 }}><Tile cat={e.category} size={56} />
      <span className="et"><b style={{ whiteSpace: 'normal', fontSize: 20, lineHeight: '26px', fontFamily: 'var(--display)' }}>{e.description}</b><span>{CAT_NAME[e.category]}</span></span></div>
    <span className="damt" style={{ opacity: 0.7 }}>{money(e.amount_cents)}</span>
    <p style={{ color: 'var(--ink)' }}>{who(s, e.paid_by)} paid on {shortDay(e.spent_on)} · deleted by {who(s, e.deleted_by, false)} on {shortDay(tsDay(e.deleted_at))}</p>
    <p className="cap">It doesn't count toward anyone's balance. Restore it to bring it back exactly as it was.</p>
    <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide icon={<Stroke name="undo" size={18} />} busy={busy} disabled={!online || archived}
      onClick={async () => { setBusy(true); try { await write((w) => w.restore_expense(e.id)); showToast({ text: `Restored ${e.description}.` }) } catch (x) { showToast({ text: errorText(x, { group: g.name }) }) } finally { setBusy(false) } }}>Restore expense</Btn>
      {archived && <p className="cap" style={{ marginTop: 8 }}>Reopen {g.name} to restore it.</p>}</div>
  </>

  const del = async () => {
    setBusy(true)
    try {
      await write((w) => w.delete_expense(e.id))
      nav(`/g/${g.id}`, { replace: true })
      showToast({ text: `Deleted ${e.description}.`, action: 'Undo', onAction: () => write((w) => w.restore_expense(e.id)) })
    } catch (x) { showToast({ text: errorText(x, { group: g.name }) }) } finally { setBusy(false) }
  }
  return <>
    <TopBar left="back" onLeft={back} />
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Tile cat={e.category} size={56} />
      <span className="et"><b style={{ whiteSpace: 'normal', fontSize: 20, lineHeight: '26px', fontFamily: 'var(--display)' }}>{e.description}</b><span>{CAT_NAME[e.category]} · {g.name}</span></span></div>
    <Mis text={money(e.amount_cents)} cls="damt" />
    <p style={{ color: 'var(--ink)' }}>{who(s, e.paid_by)} paid on {shortDay(e.spent_on)} · {method}</p>
    {eff.kind !== 'none'
      ? <div className="note" style={{ alignItems: 'center' }}><Mk kind={eff.kind} /><span>{eff.kind === 'owed' ? 'You lent' : 'You owe'} <b>{money(eff.amount)}</b></span></div>
      : <div className="note" style={{ alignItems: 'center' }}><Mk kind="none" /><span>You're not in this one.</span></div>}
    <div className="shead"><span className="label">Shares</span></div>
    <div className="list">{shares.map((x) => (
      <div className="row tight" key={x.user_id}><Av p={s.profiles[x.user_id]} size={32} />
        <span className="et"><b>{x.user_id === s.me ? 'You' : nameOf(s.profiles[x.user_id], s.profiles)}</b>
          {e.split_method === 'percent' && <span>{pctText(x.percent_bp ?? 0)}%</span>}</span>
        <span className="rv">{money(x.amount_cents)}</span></div>))}</div>
    {e.notes && <div className="fld"><Label>Note</Label><p style={{ color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{e.notes}</p></div>}
    {edits.length > 0
      ? <button type="button" className="row tight" onClick={() => nav(`/e/${e.id}/history`)}>
        <Av p={s.profiles[edits[0].actor_id]} size={28} />
        <span className="et"><b style={{ fontWeight: 400 }}>Changed by {who(s, edits[0].actor_id, false)} · {ago(edits[0].created_at)}</b></span><span className="lnk">See all changes</span></button>
      : <p className="cap">Added by {who(s, e.created_by, false)} · {ago(e.created_at)}</p>}
    {archived && <p className="cap">{g.name} is archived. Reopen it to change this.</p>}
    {!archived && <div className="actbar">
      <Btn kind="dan" wide icon={<Stroke name="trash" size={18} />} busy={busy} disabled={!online} onClick={del}>Delete</Btn>
      <Btn kind="sec" wide icon={<Stroke name="pencil" size={18} />} disabled={!online} onClick={() => nav(`/e/${e.id}/edit`)}>Edit</Btn>
    </div>}
    {!archived && <div style={{ height: 90, flexShrink: 0 }} />}
  </>
}

// ---------------------------------------------------------------- C8 changes
export function History() {
  const s = useSnap()
  const { eid } = useParams()
  const back = useBack(`/e/${eid}`)
  const e = s.expenses.find((x) => x.id === eid)
  if (!e) return <NotInGroup />
  const items = s.activity.filter((a) => a.expense_id === e.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return <>
    <TopBar left="back" title="Changes" onLeft={back} />
    <p className="cap">{e.description} · every change, newest first.</p>
    <div className="tl">
      {items.map((a) => {
        const when = `${tsDay(a.created_at) === today() ? 'Today' : shortDay(tsDay(a.created_at))} ${clock(a.created_at)}`
        const head = <><b style={{ color: 'var(--ink)' }}>{who(s, a.actor_id)}</b> <span className="cap">· {when}</span></>
        if (a.kind === 'expense_added') return <div key={a.id}><i style={{ background: 'var(--hunter)' }} />{head}
          <div className="diff">Added for {money(a.detail.amount_cents)}</div></div>
        if (a.kind === 'expense_deleted') return <div key={a.id}><i style={{ background: 'var(--red)' }} />{head}<div className="diff">Deleted</div></div>
        if (a.kind === 'expense_restored') return <div key={a.id}><i style={{ background: 'var(--hunter)' }} />{head}<div className="diff">Restored</div></div>
        const cs = changes(s, a.detail.before, a.detail.after)
        return <div key={a.id}><i />{head}
          {cs.length === 0 && <div className="diff">Saved with no changes</div>}
          {cs.map((c, i) => <div className="diff" key={i}>{c.label} <s>{c.from}</s> <Stroke name="arrow" size={14} /> <b>{c.to}</b>{c.extra ? ` (${c.extra})` : ''}</div>)}
        </div>
      })}
    </div>
  </>
}


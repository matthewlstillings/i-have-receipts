// E1 friends, E2 person, F1 activity, G1 account, G2 edit profile.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { backend, useSnap, useStore, errorText } from '../data/store.tsx'
import { friendBalances, isMember, money, nameOf, pairNetInGroup } from '../data/logic.ts'
import { Av, Btn, Empty, Label, SkelRows, Stroke, Tile, TopBar, Settled, Amount } from '../ui/kit.tsx'
import { LastUpdated, PageHead, PersonRow, Status } from './common.tsx'
import { Feed } from './group.tsx'
import { useBack } from '../ui/nav.ts'
import { useLayout } from '../ui/layout.ts'
import { Link } from 'react-router-dom'

export function FriendsList({ selected }: { selected?: string }) {
  const { snap, loading } = useStore()
  const nav = useNavigate()
  if (!snap || loading) return <><PageHead title="Friends" /><SkelRows /></>
  const s = snap
  const fb = friendBalances(s)
  const ids = [...fb.keys()].sort((a, b) => {
    const na = fb.get(a)!.net, nb = fb.get(b)!.net
    if ((na === 0) !== (nb === 0)) return na === 0 ? 1 : -1
    if (s.profiles[a].status !== s.profiles[b].status) return s.profiles[a].status === 'off' ? 1 : -1
    return Math.abs(nb) - Math.abs(na) || s.profiles[a].display_name.localeCompare(s.profiles[b].display_name)
  })
  return <>
    <PageHead title="Friends" sub="Your net with each person across groups you share." />
    <Status top />
    {ids.length === 0
      ? <Empty title="No friends yet" text="People appear here once you share a group with them."><Btn kind="sec" onClick={() => nav('/groups')}>Go to Groups</Btn></Empty>
      : <div className="list">{ids.map((id) => {
        const r = fb.get(id)!
        const gs = r.groups.map((g) => s.groups.find((x) => x.id === g)!).filter(Boolean)
        const meta = s.profiles[id].status === 'off' ? 'Account turned off' : gs.length === 1 ? gs[0].name : `${gs.length} shared groups`
        return <PersonRow key={id} s={s} id={id} meta={meta} net={r.net} to={`/friends/${id}`} sel={id === selected} />
      })}</div>}
    <LastUpdated />
  </>
}

export function Person() {
  const s = useSnap()
  const { uid } = useParams()
  const { expanded } = useLayout()
  const back = useBack('/friends')
  const p = uid ? s.profiles[uid] : undefined
  const fb = friendBalances(s)
  const r = uid ? fb.get(uid) : undefined
  if (!p || !r) return <>
    <TopBar left="back" onLeft={back} />
    <Empty title="Not in your groups" text="You only see people you share a group with." />
  </>
  const first = p.display_name.split(' ')[0]
  const groups = r.groups.map((g) => s.groups.find((x) => x.id === g)!).filter((g) => g && isMember(s, g.id))
    .map((g) => ({ g, n: pairNetInGroup(s, g.id, p.id) }))
    .sort((a, b) => Math.abs(b.n) - Math.abs(a.n))
  return <>
    {!expanded && <TopBar left="back" onLeft={back} />}
    <div className="hero" style={expanded ? { paddingTop: 24 } : undefined}><Av p={p} size={80} /><span className="title">{nameOf(p, s.profiles)}</span>
      {p.nickname && <span className="cap">"{p.nickname}"</span>}
      {p.status === 'off' && <span className="tag" style={{ alignSelf: 'center' }}>Account turned off</span>}
      {p.phone && <span className="cap">{p.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}</span>}
    </div>
    <section className="ovr">
      <Label>{r.net === 0 ? `Overall with ${first}` : r.net > 0 ? `Overall · ${first} owes you` : `Overall · you owe ${first}`}</Label>
      {r.net === 0 ? <Settled big /> : <b className={r.net > 0 ? 'mis y' : ''} style={r.net > 0 ? { color: 'var(--hunter)' } : undefined} data-t={money(Math.abs(r.net))}>{money(Math.abs(r.net))}</b>}
      <p className="cap">Settle each group on its own. There's no settling across groups.</p>
    </section>
    <div className="shead"><span className="label">By group</span></div>
    <div className="list">{groups.map(({ g, n }) => (
      <Link key={g.id} className="row" to={`/g/${g.id}`}>
        <Tile cat={g.kind} />
        <span className="et big"><b>{g.name}</b><span>{n === 0 ? (g.archived_at ? 'Archived' : 'Nothing between you in the plan') : n > 0 ? `${first} pays you in the plan` : `You pay ${first} in the plan`}</span></span>
        {n === 0 ? <span className="ra"><Settled /></span> : <Amount kind={n > 0 ? 'owed' : 'owe'} amount={money(Math.abs(n))} label={n > 0 ? 'owes you' : 'you owe'} />}
      </Link>))}</div>
  </>
}

export function ActivityTab() {
  const { snap, loading } = useStore()
  if (!snap || loading) return <><PageHead title="Activity" /><SkelRows /></>
  const s = snap
  const items = s.activity.filter((a) => isMember(s, a.group_id)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return <>
    <PageHead title="Activity" />
    <Status top />
    {items.length === 0
      ? <Empty kind="sun" title="No activity yet" text="When anyone in your groups adds, changes or settles something, it shows up here." />
      : <Feed s={s} items={items} withGroup />}
    <LastUpdated />
  </>
}

export function Account() {
  const s = useSnap()
  const { signOut, refresh } = useStore()
  const nav = useNavigate()
  const me = s.profiles[s.me]
  const [confirm, setConfirm] = useState(false)
  return <>
    <div className="hero" style={{ paddingTop: 8 }}><Av p={me} size={80} /><span className="title">{nameOf(me)}</span>
      <span className="cap">{[s.email, me.nickname && `"${me.nickname}"`].filter(Boolean).join(' · ')}</span></div>
    <Status top />
    <div className="secl">You</div>
    <div className="card">
      <button type="button" className="nrow" onClick={() => nav('/account/profile')}><Stroke name="pencil" size={20} /><span style={{ textAlign: 'left' }}>Edit profile</span><Stroke name="right" size={18} /></button>
    </div>
    {backend.mode === 'demo' && <>
      <div className="secl">Demo</div>
      <p className="demo">This is the demo: fake data saved only in this browser. Nothing you do here reaches anyone else.</p>
      <div className="card">
        {confirm
          ? <div className="nrow"><span>Put the fake data back the way it started?</span><Btn kind="sec" sm onClick={async () => { backend.reset?.(); await refresh(); setConfirm(false) }}>Reset</Btn></div>
          : <button type="button" className="nrow" onClick={() => setConfirm(true)}><Stroke name="refresh" size={20} /><span style={{ textAlign: 'left' }}>Reset demo data</span></button>}
      </div>
    </>}
    <button type="button" className="lnk" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={signOut}>Sign out</button>
    <p className="cap">Version {__APP_VERSION__} · Recorded only, no money moves.</p>
  </>
}

export function EditProfile() {
  const s = useSnap()
  const { write, showToast } = useStore()
  const back = useBack('/account')
  const me = s.profiles[s.me]
  const [nick, setNick] = useState(me.nickname ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try { await write((w) => w.update_my_profile(nick)); showToast({ text: 'Saved.' }); back() }
    catch (x) { setErr(errorText(x)) } finally { setBusy(false) }
  }
  return <>
    <TopBar left="close" title="Edit profile" onLeft={back} right="text" rightText={busy ? 'Saving' : 'Save'} onRight={save} rightOff={busy} />
    <div className="hero"><Av p={me} size={80} /></div>
    <label className="fld"><Label>Nickname · optional</Label>
      <span className="fbox"><input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder="What friends call you" autoFocus /></span>
      <span className="count">{nick.length} / 20</span></label>
    <label className="fld"><Label>Name</Label><span className="fbox dis">{me.display_name}</span></label>
    <label className="fld"><Label>Email</Label><span className="fbox dis">{s.email ?? '—'}</span></label>
    {err && <span className="ferr" role="alert"><i />{err}</span>}
    <p className="cap">Your name, email and portrait are set by Matthew. Ask him to change them.</p>
  </>
}

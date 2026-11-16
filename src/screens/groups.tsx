// B · Groups: B1 list, B2 archived, B7 members, B8 add people, B9 new group, B10 edit group.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSnap, useStore, errorText } from '../data/store.tsx'
import type { GroupKind, Snapshot } from '../data/types.ts'
import { activeMembers, GROUP_KINDS, GROUP_NAME, groupNets, guessKind, isMember, nameOf, partnerOf, money, shortDay, tsDay } from '../data/logic.ts'
import { Av, Bold, Btn, Empty, Fab, Label, SkelRows, Stroke, Tile, TopBar } from '../ui/kit.tsx'
import { ArchivedRow, GroupRow, LastUpdated, Overall, PageHead, PersonRow, Status } from './common.tsx'
import { useBack } from '../ui/nav.ts'
import { NotInGroup } from './group.tsx'

export function GroupsList({ selected, embedded }: { selected?: string; embedded?: boolean }) {
  const { snap, loading, online } = useStore()
  const nav = useNavigate()
  if (!snap || loading) return <><PageHead title="Groups" /><div className="skbal" aria-hidden="true" /><SkelRows /></>
  const s = snap
  const open = s.groups.filter((g) => !g.archived_at && isMember(s, g.id)).sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1))
  const archived = s.groups.filter((g) => g.archived_at && isMember(s, g.id))
  if (open.length === 0 && archived.length === 0) return <>
    <PageHead title="Groups" /><Status top />
    <Empty title="No groups yet" text="Start one for your next dinner, trip or shared bill. Only the people you add will see it.">
      <Btn kind="pri" icon={<Bold name="plus" size={16} />} disabled={!online} onClick={() => nav('/groups/new')}>New group</Btn>
    </Empty>
  </>
  return <>
    <PageHead title="Groups" />
    <Status top />
    <Overall s={s} />
    <div className="list">
      {open.map((g) => <GroupRow key={g.id} s={s} g={g} sel={g.id === selected} />)}
      {archived.length > 0 && <ArchivedRow n={archived.length} />}
    </div>
    <LastUpdated />
    {!embedded && <Fab text="New group" off={!online} onClick={() => nav('/groups/new')} />}
  </>
}

export function Archived() {
  const s = useSnap()
  const back = useBack('/groups')
  const list = s.groups.filter((g) => g.archived_at && isMember(s, g.id)).sort((a, b) => (a.archived_at! < b.archived_at! ? 1 : -1))
  return <>
    <TopBar left="back" title="Archived" onLeft={back} />
    <p className="cap">Settled groups you archived. Open one to look back, or reopen it if a late expense turns up.</p>
    {list.length === 0 ? <Empty kind="sun" title="Nothing archived" text="Settled groups you archive show up here." /> :
      <div className="list">{list.map((g) => <GroupRow key={g.id} s={s} g={g}
        sub={`${activeMembers(s, g.id).length} people · archived ${shortDay(tsDay(g.archived_at!))}`} />)}</div>}
  </>
}

// ---------------------------------------------------------------- B9 / B10
function KindPicker({ value, guessed, onPick }: { value: GroupKind; guessed: boolean; onPick: (k: GroupKind) => void }) {
  return (
    <div className="fld"><Label>Type</Label>
      <div className="ptiles" style={{ gap: '16px 22px' }} role="radiogroup" aria-label="Group type">
        {GROUP_KINDS.map((k) => (
          <button key={k} type="button" className="ptile" role="radio" aria-checked={k === value} onClick={() => onPick(k)}>
            <span style={{ borderRadius: 4, ...(k === value ? { boxShadow: '0 0 0 3px var(--paper),0 0 0 5px var(--blue)' } : {}) }}><Tile cat={k} size={56} /></span>
            <b>{GROUP_NAME[k]}</b>
          </button>
        ))}
      </div>
      {guessed && <span className="cap">Guessed from the name. Tap another to change it.</span>}
    </div>
  )
}

function PeopleTiles({ s, ids, onAdd, onRemove }: { s: Snapshot; ids: string[]; onAdd: () => void; onRemove: (id: string) => void }) {
  return (
    <div className="ptiles">
      {ids.map((id) => (
        <button key={id} type="button" className="ptile" onClick={() => onRemove(id)} aria-label={`Remove ${s.profiles[id].display_name}`}>
          <Av p={s.profiles[id]} size={56} /><b>{nameOf(s.profiles[id], s.profiles)}</b>
        </button>
      ))}
      <button type="button" className="ptile" onClick={onAdd}><span className="padd" aria-hidden="true"><Bold name="plus" size={20} /></span><b>Add</b></button>
    </div>
  )
}

export function GroupForm({ edit, onDone }: { edit?: boolean; onDone?: () => void }) {
  const s = useSnap()
  const { write, showToast } = useStore()
  const nav = useNavigate()
  const { gid } = useParams()
  const g = edit ? s.groups.find((x) => x.id === gid) : undefined
  const close = useBack(edit && gid ? `/g/${gid}` : '/groups')
  const done = onDone ?? close
  const [name, setName] = useState(g?.name ?? '')
  const [kind, setKind] = useState<GroupKind>(g?.kind ?? 'other')
  const [picked, setPicked] = useState(!!g)
  const [people, setPeople] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  const [errs, setErrs] = useState<{ name?: string; people?: string; save?: string }>({})
  const [busy, setBusy] = useState(false)
  if (edit && (!g || !isMember(s, g.id))) return <NotInGroup />

  const shownKind = picked ? kind : guessKind(name)
  const len = name.trim().length
  const save = async () => {
    const e: typeof errs = {}
    if (len < 1) e.name = 'Give the group a name.'
    else if (len > 32) e.name = `Keep it to 32 characters (now ${len}).`
    if (!edit && people.length === 0) e.people = 'Add at least one other person.'
    setErrs(e)
    if (e.name || e.people) return
    setBusy(true)
    try {
      if (edit) { await write((w) => w.update_group(g!.id, name, shownKind)); done() }
      else {
        const id = await write((w) => w.create_group(name, shownKind, people))
        showToast({ text: `Created ${name.trim()}.` })
        nav(`/g/${id}`, { replace: true })
      }
    } catch (x) { setErrs({ save: errorText(x) }) } finally { setBusy(false) }
  }

  if (picking) return <PickPeople s={s} exclude={[s.me]} initial={people} title="Add people" sub={() => ''}
    onCancel={() => setPicking(false)} onDone={(ids) => { setPeople(ids); setPicking(false); setErrs({ ...errs, people: undefined }) }} />

  return <>
    <TopBar left="close" title={edit ? 'Edit group' : 'New group'} onLeft={done} right={edit ? 'text' : null} rightText="Save" onRight={save} />
    <label className="fld"><Label>Name</Label>
      <span className={`fbox${errs.name ? ' err' : ''}`}><input value={name} autoFocus={!edit} placeholder="Beach weekend"
        onChange={(e) => { setName(e.target.value); setErrs({ ...errs, name: undefined }) }} aria-invalid={!!errs.name} /></span>
      {errs.name ? <span className="ferr"><i />{errs.name}</span> : <span className="count">{len} / 32</span>}
    </label>
    <KindPicker value={shownKind} guessed={!picked && len > 0} onPick={(k) => { setKind(k); setPicked(true) }} />
    {!edit && <div className="fld"><Label>People · {people.length ? `you + ${people.length}` : 'just you'}</Label>
      <PeopleTiles s={s} ids={people} onAdd={() => setPicking(true)} onRemove={(id) => setPeople(people.filter((x) => x !== id))} />
      {errs.people && <span className="ferr"><i />{errs.people}</span>}</div>}
    {edit && <p className="cap">Everyone in the group sees the change in Activity.</p>}
    {errs.save && <span className="ferr" role="alert"><i />{errs.save}</span>}
    {!edit && <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide busy={busy} onClick={save}>Create group</Btn></div>}
  </>
}

// ---------------------------------------------------------------- B8 (also the people picker for B9)
function PickPeople({ s, exclude, initial, title, sub, onCancel, onDone, busy, action }: {
  s: Snapshot; exclude: string[]; initial: string[]; title: string; sub: (id: string) => string
  onCancel: () => void; onDone: (ids: string[]) => void; busy?: boolean; action?: (n: number) => string
}) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string[]>(initial)
  const people = Object.values(s.profiles)
    .filter((p) => p.status === 'active' && !exclude.includes(p.id))
    .filter((p) => !q || `${p.display_name} ${p.nickname ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
  const label = action ? action(sel.length) : `Done${sel.length ? ` · ${sel.length}` : ''}`
  return <>
    <TopBar left="close" title={title} onLeft={onCancel} />
    <label className="fld"><span className="fbox"><Stroke name="search" size={18} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names" aria-label="Search names" /></span></label>
    <div className="list">
      {people.length === 0 && <p className="picker-empty">{q ? 'Nobody by that name.' : 'Everyone is already in.'}</p>}
      {people.map((p) => {
        const on = sel.includes(p.id)
        return (
          <button key={p.id} type="button" className="row" aria-pressed={on} onClick={() => toggle(p.id)}>
            <Av p={p} /><span className="et big"><b>{nameOf(p, s.profiles)}</b><span>{sub(p.id)}</span></span>
            <span className={`cb${on ? ' on' : ''}`}>{on && <Stroke name="check" size={18} w={3} />}</span>
          </button>
        )
      })}
    </div>
    <p className="cap">Turned-off accounts don't appear here.</p>
    <div style={{ marginTop: 'auto' }}><Btn kind="pri" wide disabled={action ? sel.length === 0 : false} busy={busy} onClick={() => onDone(sel)}>{label}</Btn></div>
  </>
}

export function AddPeople() {
  const s = useSnap()
  const { gid } = useParams()
  const { write, showToast } = useStore()
  const back = useBack(`/g/${gid}/members`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const g = s.groups.find((x) => x.id === gid)
  if (!g || !isMember(s, g.id)) return <NotInGroup />
  const inside = activeMembers(s, g.id)
  return <>
    <PickPeople s={s} exclude={inside} initial={[]} title="Add people" sub={() => `Not in ${g.name}`} onCancel={back} busy={busy}
      action={(n) => (n === 0 ? 'Add people' : `Add ${n} ${n === 1 ? 'person' : 'people'}`)}
      onDone={async (ids) => {
        setBusy(true); setErr('')
        try { await write((w) => w.add_members(g.id, ids)); showToast({ text: `Added ${ids.length} to ${g.name}.` }); back() }
        catch (x) { setErr(errorText(x, { group: g.name })) } finally { setBusy(false) }
      }} />
    {err && <span className="ferr" role="alert"><i />{err}</span>}
  </>
}

// ---------------------------------------------------------------- B7
export function Members() {
  const s = useSnap()
  const { gid } = useParams()
  const nav = useNavigate()
  const { online } = useStore()
  const back = useBack(`/g/${gid}`)
  const g = s.groups.find((x) => x.id === gid)
  const nets = useMemo(() => (g ? groupNets(s, g.id) : new Map()), [s, g])
  if (!g || !isMember(s, g.id)) return <NotInGroup />
  const partner = partnerOf(s, g.id)
  const ids = activeMembers(s, g.id).sort((a, b) => (a === s.me ? -1 : b === s.me ? 1 : s.profiles[a].display_name.localeCompare(s.profiles[b].display_name)))
  const meta = (id: string) => {
    const n = nets.get(id) ?? 0
    const base = n === 0 ? 'Settled' : n > 0 ? `Is owed ${money(n)}` : `Owes ${money(-n)}`
    return id === s.me ? `You · ${base.toLowerCase()}` : base
  }
  return <>
    <TopBar left="back" title="Members" onLeft={back} />
    <p className="cap">Everyone in {g.name} sees this list. People leave on their own; nobody can remove someone else.</p>
    {!g.archived_at && <Btn kind="sec" wide icon={<Stroke name="userplus" size={18} />} disabled={!online} onClick={() => nav(`/g/${g.id}/members/add`)}>Add people</Btn>}
    <div className="list">
      {ids.map((id) => <PersonRow key={id} s={s} id={id} meta={meta(id)} to={id === s.me ? undefined : `/friends/${id}`}
        tag={s.profiles[id].status === 'off' ? <span className="tag">Account turned off</span>
          : id === partner ? <span className="tag pair">Partner · only you two see this</span> : undefined} />)}
    </div>
  </>
}

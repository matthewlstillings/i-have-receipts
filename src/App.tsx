// The app shell: picks the layout for the window size (S-01), and routes.
// Phone: one screen at a time with the bottom tab bar.
// Medium tablet: rail + one centered pane. Expanded tablet: rail + list + detail.
// On tablets, forms open as a centered panel over the screen behind them (T4).
import { useEffect, useRef, type ReactNode } from 'react'
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useStore } from './data/store.tsx'
import { useLayout } from './ui/layout.ts'
import { Fab, Panel, Rail, TabBar } from './ui/kit.tsx'
import { LoadFailed, SignIn, Splash, TurnedOff, Welcome } from './screens/auth.tsx'
import { AddPeople, Archived, GroupForm, GroupsList, Members } from './screens/groups.tsx'
import { GroupPage } from './screens/group.tsx'
import { ExpenseDetail, ExpenseForm, History } from './screens/expense.tsx'
import { PaymentDetail, RecordPayment } from './screens/payment.tsx'
import { Account, ActivityTab, EditProfile, FriendsList, Person } from './screens/people.tsx'

type Section = 'groups' | 'friends' | 'activity' | 'account'
interface Route {
  path: string
  section: Section
  el: () => ReactNode
  form?: boolean                                  // full-screen on phones, a panel on tablets
  behind?: (p: Record<string, string>) => string  // what shows behind the panel
  root?: boolean                                  // a tab's own list screen
}

const ROUTES: Route[] = [
  { path: '/groups', section: 'groups', el: () => <GroupsList />, root: true },
  { path: '/groups/archived', section: 'groups', el: () => <Archived /> },
  { path: '/groups/new', section: 'groups', el: () => <GroupForm />, form: true, behind: () => '/groups' },
  { path: '/g/:gid', section: 'groups', el: () => <GroupPage /> },
  { path: '/g/:gid/edit', section: 'groups', el: () => <GroupForm edit />, form: true, behind: (p) => `/g/${p.gid}` },
  { path: '/g/:gid/members', section: 'groups', el: () => <Members /> },
  { path: '/g/:gid/members/add', section: 'groups', el: () => <AddPeople />, form: true, behind: (p) => `/g/${p.gid}/members` },
  { path: '/g/:gid/add', section: 'groups', el: () => <ExpenseForm />, form: true, behind: (p) => `/g/${p.gid}` },
  { path: '/g/:gid/pay', section: 'groups', el: () => <RecordPayment />, form: true, behind: (p) => `/g/${p.gid}` },
  { path: '/e/:eid', section: 'groups', el: () => <ExpenseDetail /> },
  { path: '/e/:eid/edit', section: 'groups', el: () => <ExpenseForm edit />, form: true, behind: (p) => `/e/${p.eid}` },
  { path: '/e/:eid/history', section: 'groups', el: () => <History /> },
  { path: '/p/:pid', section: 'groups', el: () => <PaymentDetail /> },
  { path: '/p/:pid/edit', section: 'groups', el: () => <RecordPayment edit />, form: true, behind: (p) => `/p/${p.pid}` },
  { path: '/friends', section: 'friends', el: () => <FriendsList />, root: true },
  { path: '/friends/:uid', section: 'friends', el: () => <Person /> },
  { path: '/activity', section: 'activity', el: () => <ActivityTab />, root: true },
  { path: '/account', section: 'account', el: () => <Account />, root: true },
  { path: '/account/profile', section: 'account', el: () => <EditProfile />, form: true, behind: () => '/account' },
]

function find(pathname: string): { r: Route; params: Record<string, string> } | null {
  for (const r of ROUTES) {
    const m = matchPath({ path: r.path, end: true }, pathname)
    if (m) return { r, params: m.params as Record<string, string> }
  }
  return null
}

const ROUTE_ELS = ROUTES.map((r) => <Route key={r.path} path={r.path} element={r.el()} />)

/** Renders a route at a given path, even if it isn't the current URL (for the screen behind a panel). */
function At({ path }: { path: string }) {
  const loc = useLocation()
  const where = path === loc.pathname ? loc : { ...loc, pathname: path, search: '', state: null, key: 'behind' }
  return <Routes location={where}>{ROUTE_ELS}</Routes>
}

export default function App() {
  const { auth, snap, loadError, toast, hideToast } = useStore()
  const { mode, tablet, expanded } = useLayout()
  const loc = useLocation()
  const nav = useNavigate()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => { if (loc.pathname === '/' && auth === 'signed-in') nav('/groups', { replace: true }) }, [loc.pathname, auth, nav])
  // A toast belongs to the screen it was shown on, plus the one a save lands on.
  const toastRef = useRef(toast)
  toastRef.current = toast
  useEffect(() => { const t = toastRef.current; if (t && Date.now() - t.id > 1500) hideToast() }, [loc.pathname, hideToast])

  if (mode === 'splash') return <Splash />
  if (auth === 'turned-off') return <TurnedOff />
  if (auth === 'signed-out') return <SignIn />
  if (auth === 'checking' && !snap) return <div className="app" aria-busy="true" />
  if (!snap) return loadError ? <LoadFailed /> : <div className="app" aria-busy="true" />
  if (!snap.welcomed) return <Welcome />

  const f = find(loc.pathname)
  if (!f) return <Navigate to="/groups" replace />
  const { r, params } = f
  const formOnTablet = tablet && r.form
  const mainPath = formOnTablet ? r.behind!(params) : loc.pathname
  const main = find(mainPath) ?? f

  const toastEl = (toast || needRefresh) && (
    <div className="toast" role="status" key={toast?.id ?? 'sw'}>
      <span>{needRefresh && !toast ? 'A new version is ready.' : toast!.text}</span>
      {needRefresh && !toast ? <b role="button" tabIndex={0} onClick={() => updateServiceWorker(true)}>Refresh</b>
        : toast!.action && <b role="button" tabIndex={0} onClick={() => { toast!.onAction?.(); hideToast() }}>{toast!.action}</b>}
    </div>
  )
  const panel = formOnTablet && <Panel onClose={() => nav(-1)} width={560}><div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 560 }}><At path={loc.pathname} /></div></Panel>

  // ---------------- phone
  if (!tablet) {
    // C5, D3 and C8 have their own bottom bar or none (boards), forms are full screen.
    const tabs = !r.form && !/^\/(e|p)\//.test(loc.pathname)
    return (
      <div className="app">
        <div className="safe" />
        <main className={`scroll${tabs ? ' pb' : ''}`} key={loc.pathname}><At path={loc.pathname} /></main>
        {tabs ? <TabBar active={main.r.section} /> : <div className="home-ind" />}
        {toastEl}
      </div>
    )
  }

  // ---------------- tablets
  const section = main.r.section
  const twoPane = expanded && (section === 'groups' || section === 'friends')
  if (twoPane) {
    const selGroup = section === 'groups' ? groupOf(snap, mainPath) : undefined
    const selFriend = section === 'friends' ? matchPath('/friends/:uid', mainPath)?.params.uid : undefined
    const listIsMain = main.r.root
    return (
      <div className="app tablet">
        <Rail active={main.r.section} />
        <section className="pane list" style={{ flex: 'none', position: 'relative' }}>
          <div className="safe" />
          <main className="scroll" style={{ paddingBottom: 96 }}>
            {section === 'groups' ? <GroupsList selected={selGroup} embedded /> : <FriendsList selected={selFriend} />}
          </main>
          {section === 'groups' && <NewGroupFab />}
        </section>
        <section className="pane" style={{ flex: 1, position: 'relative' }}>
          <div className="safe" />
          <main className="scroll" style={{ padding: '0 32px 32px' }} key={mainPath}>
            <div style={{ maxWidth: 720, width: '100%', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              {listIsMain ? <DetailEmpty section={section} /> : <At path={mainPath} />}
            </div>
          </main>
        </section>
        {panel}{toastEl}
      </div>
    )
  }
  return (
    <div className="app tablet">
      <Rail active={main.r.section} />
      <section className="pane" style={{ flex: 1, position: 'relative' }}>
        <div className="safe" />
        <main className="scroll" key={mainPath}>
          <div className={`center${section === 'account' ? ' narrow' : ''}`} style={{ flex: 1 }}><At path={mainPath} /></div>
        </main>
      </section>
      {panel}{toastEl}
    </div>
  )
}

function groupOf(s: NonNullable<ReturnType<typeof useStore>['snap']>, path: string): string | undefined {
  const g = matchPath('/g/:gid/*', path)?.params.gid ?? matchPath('/g/:gid', path)?.params.gid
  if (g) return g
  const e = matchPath('/e/:eid/*', path)?.params.eid ?? matchPath('/e/:eid', path)?.params.eid
  if (e) return s.expenses.find((x) => x.id === e)?.group_id
  const p = matchPath('/p/:pid/*', path)?.params.pid ?? matchPath('/p/:pid', path)?.params.pid
  if (p) return s.payments.find((x) => x.id === p)?.group_id
  return undefined
}

function DetailEmpty({ section }: { section: Section }) {
  return <div className="detail-empty"><div className="empty">
    <span className="sub">{section === 'groups' ? 'Pick a group' : 'Pick a friend'}</span>
    <p>{section === 'groups' ? 'Its expenses and balances open here.' : 'Your balance with them, group by group, opens here.'}</p>
  </div></div>
}

function NewGroupFab() {
  const nav = useNavigate()
  const { online } = useStore()
  return <Fab text="New group" off={!online} minimal onClick={() => nav('/groups/new')} />
}

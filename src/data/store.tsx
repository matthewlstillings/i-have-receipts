import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Backend, Snapshot, Writes } from './types.ts'
import { AppError } from './types.ts'
import { createDemoBackend } from './demo.ts'
import { createSupabaseBackend } from './supabase.ts'
import { money } from './logic.ts'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const backend: Backend & { reset?: () => void } =
  URL_ && KEY_ ? createSupabaseBackend(URL_, KEY_) : createDemoBackend()

const CACHE = 'receipts-snapshot'

export type AuthState = 'checking' | 'signed-out' | 'signed-in' | 'turned-off'

export interface Toast { id: number; text: string; action?: string; onAction?: () => void }

interface Store {
  auth: AuthState
  snap: Snapshot | null
  loading: boolean      // first load, nothing to show yet
  refreshing: boolean   // have data, fetching newer
  loadError: boolean
  online: boolean
  refresh(): Promise<void>
  /** Runs a write, then reloads. Throws AppError so forms can keep their values. */
  write<T>(fn: (w: Writes) => Promise<T>): Promise<T>
  signOut(): Promise<void>
  toast: Toast | null
  showToast(t: Omit<Toast, 'id'>): void
  hideToast(): void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}
/** For screens that only render when signed in. */
export function useSnap(): Snapshot {
  return useStore().snap!
}

function readCache(): Snapshot | null {
  try { const r = localStorage.getItem(CACHE); return r ? JSON.parse(r) : null } catch { return null }
}
function writeCache(s: Snapshot | null) {
  try { s ? localStorage.setItem(CACHE, JSON.stringify(s)) : localStorage.removeItem(CACHE) } catch { /* ignore */ }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>('checking')
  const [snap, setSnap] = useState<Snapshot | null>(() => readCache())
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const snapRef = useRef(snap)
  snapRef.current = snap

  const refresh = useCallback(async () => {
    const had = !!snapRef.current
    had ? setRefreshing(true) : setLoading(true)
    try {
      const s = await backend.load()
      setSnap(s); writeCache(s); setLoadError(false); setAuth('signed-in')
    } catch (e) {
      const code = e instanceof AppError ? e.code : ''
      if (code === 'account_off') { setAuth('turned-off'); setSnap(null); writeCache(null) }
      else if (code === 'not_signed_in') { setAuth('signed-out'); setSnap(null); writeCache(null) }
      else setLoadError(true)
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    let alive = true
    const check = async () => {
      const u = await backend.currentUser()
      if (!alive) return
      if (!u) { setAuth('signed-out'); setSnap(null); writeCache(null); return }
      if (snapRef.current && snapRef.current.me !== u) { setSnap(null); writeCache(null) }
      setAuth(snapRef.current ? 'signed-in' : 'checking')
      await refresh()
    }
    check()
    const off = backend.onAuthChange(check)
    return () => { alive = false; off() }
  }, [refresh])

  useEffect(() => {
    const on = () => { setOnline(true); refresh() }
    const off = () => setOnline(false)
    const vis = () => { if (document.visibilityState === 'visible' && auth === 'signed-in') refresh() }
    window.addEventListener('online', on); window.addEventListener('offline', off)
    document.addEventListener('visibilitychange', vis)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); document.removeEventListener('visibilitychange', vis) }
  }, [refresh, auth])

  const write = useCallback(async <T,>(fn: (w: Writes) => Promise<T>): Promise<T> => {
    if (!navigator.onLine) throw new AppError('offline')
    try {
      const out = await fn(backend)
      await refresh()
      return out
    } catch (e) {
      const err = e instanceof AppError ? e : new AppError(e instanceof TypeError ? 'offline' : String((e as Error)?.message ?? e))
      if (err.code === 'account_off') setAuth('turned-off')
      throw err
    }
  }, [refresh])

  const hideToast = useCallback(() => { setToast(null); window.clearTimeout(toastTimer.current) }, [])
  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    window.clearTimeout(toastTimer.current)
    setToast({ ...t, id: Date.now() })
    toastTimer.current = window.setTimeout(() => setToast(null), t.action ? 6000 : 3500)
  }, [])

  const signOut = useCallback(async () => {
    await backend.signOut(); writeCache(null); setSnap(null); setAuth('signed-out')
  }, [])

  const value = useMemo<Store>(() => ({ auth, snap, loading, refreshing, loadError, online, refresh, write, signOut, toast, showToast, hideToast }),
    [auth, snap, loading, refreshing, loadError, online, refresh, write, signOut, toast, showToast, hideToast])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** The sentence for each error code the database (or demo) can raise. */
export function errorText(e: unknown, names: { group?: string } = {}): string {
  const err = e instanceof AppError ? e : new AppError(String((e as Error)?.message ?? e))
  switch (err.code) {
    case 'offline': return "Couldn't save. Check your connection and try again. Nothing you typed was lost."
    case 'account_off': return 'Your account was turned off.'
    case 'not_in_group': return "You're not in this group."
    case 'group_archived': return `${names.group ?? 'This group'} was archived. Reopen it to add or change anything.`
    case 'date_in_future': return 'Pick today or an earlier day.'
    case 'person_not_available': return 'Someone in this split is no longer in the group or was turned off.'
    case 'nobody_owes_anything': return 'Add someone else, or nobody owes anything.'
    case 'percent_must_be_100': return 'Percents need to add up to 100%.'
    case 'exact_over_total': case 'exact_must_add_up': return 'Amounts need to add up to the total.'
    case 'version_conflict': return `${err.arg || 'Someone'} changed this while you were editing.`
    case 'name_length': return 'Use 1 to 32 characters.'
    case 'needs_another_member': return 'Add at least one other person.'
    case 'unlink_first': return 'Unlink from your partner first.'
    case 'settle_first': return `Settle your ${money(Number(err.arg) || 0)} first.`
    case 'last_member': return "You're the last member. Archive or delete the group instead."
    case 'not_settled': return 'Everyone needs to be settled first.'
    case 'group_has_money': return 'Only groups with no expenses or payments can be deleted.'
    case 'already_paired': return 'One of you is already linked with someone in this group.'
    case 'not_your_payment': return 'Only the two people in a payment can record or change it.'
    case 'amount_range': return 'Enter an amount from $0.01 to $99,999.99.'
    case 'description_length': return 'Add a short description, up to 60 characters.'
    case 'expense_deleted': return 'This expense was deleted. Restore it to change it.'
    case 'not_found': return 'This no longer exists.'
    default: return 'Something went wrong. Try again.'
  }
}

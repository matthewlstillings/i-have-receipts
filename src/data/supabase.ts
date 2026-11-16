// Live backend: Supabase. Reads go straight to the tables (row-level security
// decides what comes back); writes go only through the database functions in
// supabase/migrations, which enforce every money rule.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, ExpenseInput, Snapshot, Profile } from './types.ts'
import { AppError } from './types.ts'

export function createSupabaseBackend(url: string, key: string): Backend {
  // The app lives in its own "receipts" schema inside the shared Personal Projects project.
  const sb: SupabaseClient<any, 'receipts'> = createClient(url, key, {
    db: { schema: 'receipts' },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'receipts-auth' },
  })

  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args)
    if (error) throw toAppError(error)
    return data as T
  }
  const exArgs = (i: ExpenseInput) => ({
    p_description: i.description, p_amount_cents: i.amount_cents, p_category: i.category,
    p_category_picked: i.category_picked, p_paid_by: i.paid_by, p_method: i.method, p_users: i.users,
    p_pct: i.pct, p_exact: i.exact, p_spent_on: i.spent_on, p_notes: i.notes,
  })
  const all = async <T>(table: string, q?: (b: any) => any): Promise<T[]> => {
    let b = sb.from(table).select('*')
    if (q) b = q(b)
    const { data, error } = await b
    if (error) throw toAppError(error)
    return (data ?? []) as T[]
  }

  return {
    mode: 'live',
    async currentUser() {
      const { data } = await sb.auth.getSession()
      return data.session?.user.id ?? null
    },
    async sendCode(email) {
      // shouldCreateUser:false means unknown emails get nothing, and the
      // screen looks the same either way (S-16).
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
      if (error && !/signups not allowed|user not found|otp_disabled/i.test(error.message)) throw toAppError(error)
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) throw new AppError(/expired/i.test(error.message) ? 'code_expired' : 'bad_code')
    },
    async signOut() { await sb.auth.signOut() },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => cb())
      return () => data.subscription.unsubscribe()
    },

    async load(): Promise<Snapshot> {
      const { data: s } = await sb.auth.getSession()
      const me = s.session?.user.id
      if (!me) throw new AppError('not_signed_in')
      const [profiles, settings, groups, members, pairs, expenses, shares, payments, activity] = await Promise.all([
        all<Profile>('profiles'),
        all<{ welcomed_at: string | null }>('profile_settings', (b) => b.eq('user_id', me)),
        all<any>('groups'), all<any>('group_members'), all<any>('group_pairs'),
        all<any>('expenses'), all<any>('expense_shares'), all<any>('payments'),
        all<any>('activity', (b) => b.order('created_at', { ascending: false }).limit(1000)),
      ])
      const mine = profiles.find((p) => p.id === me)
      // RLS hides every profile from a turned-off account, including their own.
      if (!mine || mine.status !== 'active') throw new AppError('account_off')
      return {
        me, email: s.session?.user.email ?? null, welcomed: !!settings[0]?.welcomed_at,
        profiles: Object.fromEntries(profiles.map((p) => [p.id, p])),
        groups, members, pairs, expenses, shares, payments, activity, loadedAt: Date.now(),
      }
    },

    finish_welcome: (n) => call('finish_welcome', { p_nickname: n }),
    update_my_profile: (n) => call('update_my_profile', { p_nickname: n }),
    create_group: (n, k, m) => call('create_group', { p_name: n, p_kind: k, p_members: m }),
    update_group: (g, n, k) => call('update_group', { g, p_name: n, p_kind: k }),
    add_members: (g, u) => call('add_members', { g, p_users: u }),
    leave_group: (g) => call('leave_group', { g }),
    archive_group: (g) => call('archive_group', { g }),
    reopen_group: (g) => call('reopen_group', { g }),
    delete_group: (g) => call('delete_group', { g }),
    link_partner: (g, o) => call('link_partner', { g, p_other: o }),
    unlink_partner: (g) => call('unlink_partner', { g }),
    create_expense: (i) => call('create_expense', { p_group: i.group, ...exArgs(i) }),
    update_expense: (id, v, i) => call('update_expense', { p_id: id, p_version: v, ...exArgs(i) }),
    delete_expense: (id) => call('delete_expense', { p_id: id }),
    restore_expense: (id) => call('restore_expense', { p_id: id }),
    record_payment: (g, f, t, a, d) => call('record_payment', { g, p_from: f, p_to: t, p_amount_cents: a, p_paid_on: d }),
    update_payment: (id, v, a, d) => call('update_payment', { p_id: id, p_version: v, p_amount_cents: a, p_paid_on: d }),
    delete_payment: (id) => call('delete_payment', { p_id: id }),
    restore_payment: (id) => call('restore_payment', { p_id: id }),
  }
}

function toAppError(e: { message: string; code?: string }): AppError {
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(e.message)) return new AppError('offline')
  if (e.code === 'PGRST301' || /JWT/i.test(e.message)) return new AppError('not_signed_in')
  return new AppError(e.message)
}

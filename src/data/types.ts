// Row shapes mirror supabase/migrations/0001_schema.sql exactly, so the demo
// backend and the live backend hand the screens the same data.

export type Category = 'food' | 'entertainment' | 'home' | 'life' | 'transport' | 'utilities' | 'uncategorized'
export type GroupKind = 'trip' | 'home' | 'couple' | 'other'
export type SplitMethod = 'equal' | 'exact' | 'percent'
export type ActivityKind =
  | 'expense_added' | 'expense_edited' | 'expense_deleted' | 'expense_restored'
  | 'payment_added' | 'payment_edited' | 'payment_deleted'
  | 'member_added' | 'member_left'
  | 'group_created' | 'group_edited' | 'group_archived' | 'group_reopened'
  | 'pair_linked' | 'pair_unlinked'

export interface Profile {
  id: string
  display_name: string
  nickname: string | null
  phone: string | null
  avatar_path: string | null
  status: 'active' | 'off'
  is_admin: boolean
  created_at: string
}

export interface Group {
  id: string
  name: string
  kind: GroupKind
  created_by: string
  created_at: string
  last_activity_at: string
  archived_at: string | null
  archived_by: string | null
}

export interface Member {
  group_id: string
  user_id: string
  added_by: string | null
  joined_at: string
  left_at: string | null
}

export interface Pair {
  id: string
  group_id: string
  user_a: string
  user_b: string
  linked_by: string
  created_at: string
  ended_at: string | null
}

export interface Expense {
  id: string
  group_id: string
  description: string
  notes: string | null
  amount_cents: number
  category: Category
  category_picked: boolean
  paid_by: string
  split_method: SplitMethod
  spent_on: string // YYYY-MM-DD
  version: number
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export interface Share {
  expense_id: string
  user_id: string
  percent_bp: number | null
  exact_cents: number | null
  amount_cents: number
}

export interface Payment {
  id: string
  group_id: string
  from_user: string
  to_user: string
  amount_cents: number
  paid_on: string
  version: number
  created_by: string
  created_at: string
  updated_by: string | null
  updated_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export interface Activity {
  id: number
  group_id: string
  actor_id: string
  kind: ActivityKind
  expense_id: string | null
  payment_id: string | null
  subject_user: string | null
  detail: Record<string, any>
  visible_to: string[] | null
  created_at: string
}

/** Everything the signed-in person is allowed to see, already filtered by the rules in the database. */
export interface Snapshot {
  me: string
  email: string | null
  welcomed: boolean
  profiles: Record<string, Profile>
  groups: Group[]
  members: Member[]
  pairs: Pair[]
  expenses: Expense[]
  shares: Share[]
  payments: Payment[]
  activity: Activity[]
  loadedAt: number
}

export interface ExpenseInput {
  group: string
  description: string
  amount_cents: number
  category: Category
  category_picked: boolean
  paid_by: string
  method: SplitMethod
  users: string[]
  pct: number[] | null      // basis points, one per user
  exact: (number | null)[] | null
  spent_on: string
  notes: string | null
}

/** The write functions in 0002_write_functions.sql (plus create_expense from 0001). */
export interface Writes {
  finish_welcome(nickname: string): Promise<void>
  update_my_profile(nickname: string): Promise<void>
  create_group(name: string, kind: GroupKind, members: string[]): Promise<string>
  update_group(g: string, name: string, kind: GroupKind): Promise<void>
  add_members(g: string, users: string[]): Promise<void>
  leave_group(g: string): Promise<void>
  archive_group(g: string): Promise<void>
  reopen_group(g: string): Promise<void>
  delete_group(g: string): Promise<void>
  link_partner(g: string, other: string): Promise<void>
  unlink_partner(g: string): Promise<void>
  create_expense(e: ExpenseInput): Promise<string>
  update_expense(id: string, version: number, e: ExpenseInput): Promise<number>
  delete_expense(id: string): Promise<void>
  restore_expense(id: string): Promise<void>
  record_payment(g: string, from: string, to: string, amount_cents: number, paid_on: string): Promise<string>
  update_payment(id: string, version: number, amount_cents: number, paid_on: string): Promise<number>
  delete_payment(id: string): Promise<void>
  restore_payment(id: string): Promise<void>
}

export interface Backend extends Writes {
  mode: 'demo' | 'live'
  currentUser(): Promise<string | null>
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
  load(): Promise<Snapshot>
  onAuthChange(cb: () => void): () => void
}

/** An error from a write function, carrying the short code the database raised. */
export class AppError extends Error {
  code: string
  arg: string
  constructor(raw: string) {
    super(raw)
    const [code, ...rest] = raw.split(':')
    this.code = code.trim()
    this.arg = rest.join(':').trim()
  }
}

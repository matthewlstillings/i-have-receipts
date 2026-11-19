# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Matthew's friend group: roughly 5–15 people, including a few couples. They log shared costs on their phones in the moment, during group trips, dinners, nights out and house rentals, then settle up afterwards. Matthew is also the only admin. He adds and removes people himself in Supabase, never in the app.

## Product Purpose

Keeping Receipts is a private Splitwise clone. It records who paid, how each cost splits, and who owes whom, then suggests the fewest payments to settle a group. It never moves money; people pay each other outside the app and record it.

It exists because the group doesn't use Splitwise enough to justify paying for it. Success means the group uses this instead and settles up without arguing about the numbers.

## Positioning

- **Free, private and invite-only.** No sign-ups and no invites from inside the app; only people Matthew adds can get in.
- **Couples are linked** and settle as one unit inside a group, without merging their records.
- **One simple payment plan per group** ("who pays whom") feeds the balance card, Settle up and Friends.
- **Built for this group's own humor:** the name and voice are drag slang for keeping proof.

## Operating Context

- **Phone-first PWA**, installed to the home screen. Medium and expanded tablet layouts exist; at 1400px and wider the site shows a splash with a QR code instead of the app.
- **Sign-in:** a 6-digit email code, no passwords.
- **Offline:** view-only.
- **Typical flow:** open a group → add an expense (amount, description, who paid, how it splits: equally, exact amounts or percent) → check the balance card → settle up → record the payment.
- **Groups** can be archived, reopened, left or deleted. Expenses and payments keep a change history and can be restored after deletion.

## Capabilities and Constraints

- **Stack:** Vite + React + TypeScript, Supabase (auth and database) and Vercel hosting. Client-only: no server code yet.
- **Data:** the `receipts` schema lives in Matthew's shared "Personal Projects" Supabase project. Clients write only through database functions, and every table has row-level security.
- **Access:** one shared login across Matthew's friends apps (`core` schema), with access granted per app.
- **Limits:** amounts up to $99,999.99; group names up to 32 characters.
- **Categories:** seven Splitwise-style categories, guessed automatically from the description.
- **Not built yet:** text (SMS) notifications, and adding people in the app (both planned as phase 2).
- **Undecided:** when sign-in will be shared across all `*.junk-drawer.dev` apps.
- **Terminology:**
    - "group"
    - "expense"
    - "payment" (not "transfer")
    - "settle up"
    - "linked pair" or "partner" (not "household")
    - "you owe" / "you're owed"

## Brand Commitments

- **Name:** Keeping Receipts. Home-screen label: Receipts. Renamed from "I Have Receipts" on Nov 18, 2026.
- **Tagline:** "People will lie, keep the receipts."
- **Voice:** campy throughout. Drag-slang personality appears across the app's copy, not only in the name. Money facts (amounts, who owes whom, what a button will do) always stay literal and unambiguous.
- **Visual system:** the existing Overprint risograph system is binding. Light mode only, overriding Matthew's usual dark-mode default.
- **Assets:**
    - receipt-fan app icon: `public/icon.svg` and the PNGs
    - hunter-ink default avatar: `public/avatar-default.svg`
    - riso avatar process for friends' photos: Claude project doc `riso-avatar-process.md`

## Evidence on Hand

- **No real users, testimonials or usage data yet.** The beta runs on fake seeded data (`receipts_app.seed_demo()`), which will be wiped before real use. Don't present seeded names or numbers as real.
- **Portrait photos** of friends need each person's consent before they're used.

## Product Principles

1. **The numbers are never the joke.** Humor can surround a balance, but never blur who owes whom or how much.
2. **Fast at the table.** Logging an expense mid-dinner on a phone beats completeness; sensible defaults and auto-guessed categories carry the load.
3. **Fewest payments to settle.** One payment plan per group, shown the same way everywhere.
4. **Private by construction.** Nothing in the app lets someone add people, see another app's data or reach outside their groups.
5. **Undo over confirm.** Deleted expenses and payments can be restored, and history shows what changed.

## Accessibility & Inclusion

- **Minimum tap size:** 44px.
- **Text:** never set in the fluo pink ink.
- **Focus:** visible focus rings are required.
- **Offline:** read-only offline must stay clear about what can't be done.

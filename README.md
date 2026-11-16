# I Have Receipts

A private expense splitter for one friend group. It records who owes whom and never moves money.

- **Stack:** Vite + React + TypeScript PWA, Supabase (Postgres, row-level security, email codes), hosted on Vercel.
- **Design:** Overprint (risograph) design system. The styles in `src/styles/app.css` are copied from the approved screen canvas.
- **Spec, screen map, data model, review log:** the "I Have Receipts — Build Plan" doc.

## Two modes

| Mode | When | Data |
| --- | --- | --- |
| **Demo** | No Supabase keys set | Fake data saved in your browser only. Any email and any 6 digits sign you in as Matthew. "Reset demo data" is on the Account tab. |
| **Live** | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set | The shared Supabase database. Real sign-in codes by email. |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (demo mode unless .env.local has keys)
npm test           # money rules: splits, rounding, balances, payment plan
npm run build      # type-checks, then builds to dist/
```

## Set up the live backend (one time)

1. **Create a Supabase project.** Copy the Project URL and the anon (publishable) key from Project Settings → API.
2. **Run the SQL** in the SQL editor, in this order:
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_write_functions.sql`
   3. `supabase/seed_demo.sql` (only defines the fake-data functions; it adds nothing yet)
3. **Turn on email codes** (Authentication → Sign In / Providers → Email):
   - Email provider on, "Confirm email" on.
   - **Turn off "Allow new users to sign up"**. Only Matthew adds people (no sign-up screen).
   - Email OTP expiration: **600** seconds (10 minutes). OTP length: **6**.
4. **Change the sign-in email** so it sends the code, not a link (Authentication → Emails → Magic Link template). Put `{{ .Token }}` in the body, for example:
   `Your Receipts code is {{ .Token }}. It works for 10 minutes.`
5. **Set up an email sender (SMTP).** Supabase's built-in sender only delivers to your own team's addresses, so friends would get no code. Use Resend, Postmark or similar (Authentication → Emails → SMTP Settings). It needs a domain you own.
6. **Add people.** For each friend: Authentication → Users → Add user → their email (no password). Then in the SQL editor:
   ```sql
   select app.add_person('you@example.com', 'Matthew L.', true);  -- you, as admin
   select app.add_person('rio@example.com', 'Rio M.');
   ```
7. **Fake beta data (optional):** `select app.seed_demo();` adds 5 fake friends and 5 groups that every real person is also in. When the beta is over: `select app.wipe_demo();` deletes **every** group and the fake friends.

## Deploy on Vercel

1. Import this GitHub repo in Vercel. Framework: Vite (auto-detected). Build command `npm run build`, output `dist`.
2. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Leave them out to deploy the demo.
3. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel URL (or your domain).

`vercel.json` sends every path to `index.html`, so deep links like `/g/<id>` work.

## Tests

- `npm test`: TypeScript money rules.
- SQL: on any Postgres 16, run `supabase/tests/stubs.sql`, both migrations, then `supabase/tests/test.sql` and `supabase/tests/test_writes.sql` (each on a fresh database). Every check prints `ok` or the expected numbers, and the files end with `ALL TESTS RAN` / `ALL WRITE TESTS RAN`.
- `scripts/shots.py`: clicks through the demo build at phone and tablet sizes and saves screenshots (needs Python Playwright). Run `npx vite preview --port 4173` first.

## Not in this beta

- **Text messages:** post-MVP. The tables stay, but nothing is queued or sent.
- **Managing people in the app (G3, G4):** Phase 2. Use step 6 above.
- **Avatars:** initials for now. The riso portraits come later (`profiles.avatar_path` takes an image URL).
- **Receipts (photos):** Phase 2.
- **App icon:** the "R" is a placeholder until the real one is drawn.

## Where things are

```
src/data/logic.ts      money rules (ports of the SQL), dates, guesses
src/data/demo.ts       demo backend: the database rules in the browser, plus the fake data
src/data/supabase.ts   live backend: reads tables, writes through database functions
src/data/store.tsx     signed-in state, snapshot, offline cache, toasts, error sentences
src/ui/                Overprint components (kit.tsx), layout sizes, activity sentences
src/screens/           one file per area: auth, groups, group, expense, payment, people
supabase/              migrations, fake-data functions, SQL tests
```

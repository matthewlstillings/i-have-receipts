"""Click through the demo build and screenshot each screen (phone + tablets).
Usage: npx vite preview --port 4173 &  then  python3 scripts/shots.py [outdir]"""
import asyncio, sys, os
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
BASE = 'http://localhost:4173'
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errors = []

        async def page(w, h):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, service_workers='block')
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            return pg

        async def shot(pg, name):
            await pg.wait_for_timeout(350)
            await pg.screenshot(path=f'{OUT}/{name}.png')

        pg = await page(390, 844)
        await pg.goto(BASE)
        await shot(pg, 'A2-signin')
        await pg.click('text=Email me a code'); await shot(pg, 'A2-error')
        await pg.fill('input[type=email]', 'matt@example.com')
        await pg.click('text=Email me a code'); await pg.wait_for_selector('text=Check your email')
        await pg.keyboard.type('123'); await shot(pg, 'A3-code')
        await pg.keyboard.type('456'); await pg.wait_for_selector('text=Welcome')
        await shot(pg, 'A4-welcome')
        await pg.click('text=Continue'); await pg.wait_for_selector('text=Overall')
        await shot(pg, 'B1-groups')
        await pg.click('text=Supper Club'); await pg.wait_for_selector('.bal')
        await shot(pg, 'B3-group')
        await pg.click('[aria-label="Show breakdown"]'); await shot(pg, 'B3-open')
        await pg.click('text=Settle up'); await shot(pg, 'D1-settle')
        await pg.click('[aria-label="Close"]')
        await pg.click('[aria-label="More"]'); await shot(pg, 'B6-menu')
        await pg.click('[aria-label="Close"]')
        await pg.click('.utabs >> text=Balances'); await shot(pg, 'B4-balances')
        await pg.click('.utabs >> text=Activity'); await shot(pg, 'B5-activity')
        await pg.click('.utabs >> text=Expenses')
        await pg.click('text=Tacos at Los Mariscos'); await pg.wait_for_selector('text=Shares')
        await shot(pg, 'C5-detail')
        await pg.click('text=See all changes'); await shot(pg, 'C8-history')
        await pg.go_back(); await pg.click('.actbar >> text=Edit'); await shot(pg, 'C2-edit')
        await pg.click('[aria-label="Close"]')
        await pg.go_back()
        # add an expense
        await pg.click('[aria-label="Add expense"]'); await pg.wait_for_selector('text=In Supper Club')
        await shot(pg, 'C1-blank')
        await pg.fill('[aria-label="Amount in dollars"]', '86.50')
        await pg.fill('input[placeholder="What was it?"]', 'Groceries for brunch')
        await shot(pg, 'C1-filled')
        await pg.click('.chip >> text=Category'); await shot(pg, 'C3-category'); await pg.click('.sheet [aria-label="Close"]')
        await pg.click('.chip >> text=Paid by'); await shot(pg, 'C4-paidby'); await pg.click('.sheet [aria-label="Close"]')
        await pg.click('.chip >> text=Date'); await shot(pg, 'C7-date'); await pg.click('.sheet [aria-label="Close"]')
        await pg.click('.chip >> text=Split'); await shot(pg, 'C6-equal')
        await pg.click('.seg >> text=Exact'); await shot(pg, 'C6-exact')
        inputs = pg.locator('.exin input')
        await inputs.nth(0).fill('20'); await inputs.nth(1).fill('30'); await shot(pg, 'C6-exact-edited')
        await inputs.nth(2).fill('50'); await shot(pg, 'C6-exact-over')
        await pg.click('.seg >> text=Percent'); await shot(pg, 'C6-percent')
        await pg.locator('.exin input').nth(0).fill('40'); await shot(pg, 'C6-percent-typed')
        await pg.click('.seg >> text=Equally'); await pg.click('text=Done')
        await pg.click('text=Save expense'); await pg.wait_for_selector('text=Groceries for brunch')
        await shot(pg, 'B3-added')
        # delete + undo
        await pg.click('text=Groceries for brunch'); await pg.click('.actbar >> text=Delete')
        await pg.wait_for_selector('.toast'); await shot(pg, 'C-deleted-toast')
        await pg.click('.toast >> text=Undo'); await pg.wait_for_timeout(500)
        # Apartment 4B: you owe
        await pg.click('.tab >> text=Groups'); await pg.click('text=Apartment 4B'); await pg.wait_for_selector('.bal')
        await shot(pg, 'B3-owe')
        await pg.click('.bal >> text=Settle up'); await pg.click('text=tap to pay part >> nth=0'); await pg.wait_for_selector('text=Record payment')
        await shot(pg, 'D2-record')
        await pg.go_back()
        await pg.click('.tab >> text=Groups'); await pg.click("text=Jo's birthday"); await pg.wait_for_selector('.bal')
        await shot(pg, 'B3-other')
        await pg.click('.tab >> text=Groups'); await pg.click('text=Catskills weekend'); await pg.wait_for_selector('.bal'); await shot(pg, 'B3-settled')
        await pg.click('.tab >> text=Groups'); await pg.click('text=Archived'); await shot(pg, 'B2-archived')
        await pg.click('text=Beach house 2025'); await shot(pg, 'B3-archived')
        await pg.click('.tab >> text=Groups'); await pg.click('[aria-label="New group"]'); await shot(pg, 'B9-new')
        await pg.click('text=Create group'); await shot(pg, 'B9-errors')
        await pg.fill('input[placeholder="Beach weekend"]', 'Ski trip'); await pg.click('.ptile >> text=Add')
        await shot(pg, 'B8-pick'); await pg.click('text=Rio M.'); await pg.click('text=Done')
        await shot(pg, 'B9-filled')
        await pg.click('text=Create group'); await pg.wait_for_selector('text=No expenses yet'); await shot(pg, 'B3-empty')
        await pg.click('[aria-label="More"]'); await shot(pg, 'B6-menu-empty'); await pg.click('text=Delete group'); await shot(pg, 'H1-delete')
        await pg.click('.dlg >> text=Cancel')
        await pg.click('.tab >> text=Friends'); await shot(pg, 'E1-friends')
        await pg.click('text=Priya L.'); await shot(pg, 'E2-person')
        await pg.click('.tab >> text=Activity'); await shot(pg, 'F1-activity')
        await pg.click('.tab >> text=Account'); await shot(pg, 'G1-account')
        await pg.click('text=Edit profile'); await shot(pg, 'G2-profile')

        # tablets
        for (w, h, tag) in [(834, 1194, 'T-medium'), (1194, 834, 'T-expanded')]:
            t = await page(w, h)
            await t.goto(BASE)
            await t.fill('input[type=email]', 'matt@example.com'); await t.click('text=Email me a code')
            await t.wait_for_selector('text=Check your email'); await t.keyboard.type('123456')
            await t.wait_for_selector('text=Continue'); await t.click('text=Continue')
            await t.wait_for_selector('text=Overall')
            await shot(t, f'{tag}-groups')
            await t.click('text=Supper Club'); await t.wait_for_selector('.bal'); await shot(t, f'{tag}-group')
            await t.click('[aria-label="Add expense"]'); await shot(t, f'{tag}-add'); await t.keyboard.press('Escape')
            await t.click('.bal >> text=Settle up'); await shot(t, f'{tag}-settle'); await t.keyboard.press('Escape')
            await t.click('.rtab >> text=Friends'); await t.click('text=Priya L.'); await shot(t, f'{tag}-friends')
            await t.click('.rtab >> text=Activity'); await shot(t, f'{tag}-activity')
            await t.click('.rtab >> text=Account'); await shot(t, f'{tag}-account')
        s = await page(1440, 900)
        await s.goto(BASE); await shot(s, 'A1-splash')
        await b.close()
        print('\n'.join(sorted(set(errors))) or 'no console errors')

asyncio.run(main())

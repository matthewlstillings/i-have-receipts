"""No-letter app icon options: receipts, plus cheeky takes on "I have receipts"."""
import math, json
from riso_svgs import C, PAPER, CREAM, INK, MID, M, grain, svg, dots

G = '<rect width="512" height="512" filter="url(#g)" ' + M + '/>'

def slip_points(x, y, w, h, teeth=9, top_teeth=False, depth=14):
    pts = []
    if top_teeth:
        for i in range(teeth + 1):
            pts.append((x + w * i / teeth, y + (0 if i % 2 == 0 else depth)))
    else:
        pts += [(x, y), (x + w, y)]
    for i in range(teeth, -1, -1):
        pts.append((x + w * i / teeth, y + h - (0 if i % 2 == 0 else depth)))
    return ' '.join(f'{a:.1f},{b:.1f}' for a, b in pts)

def slip(x, y, w, h, fill=CREAM, plate=None, off=(12, 10), rot=0, pivot=None, lines=True, teeth=9, top=False, line_col=MID, extra=''):
    pts = slip_points(x, y, w, h, teeth, top)
    px, py = pivot or (x + w / 2, y + h / 2)
    out = f'<g transform="rotate({rot} {px} {py})">'
    if plate:
        out += f'<polygon points="{pts}" transform="translate({off[0]} {off[1]})" fill="{plate[0]}" opacity="{plate[1]}" {M}/>'
    out += f'<polygon points="{pts}" fill="{fill}"/>'
    if lines:
        lx, lw = x + w * 0.14, w * 0.72
        rows = [(0.16, .55), (0.27, .8), (0.36, .65), (0.45, .75), (0.54, .5)]
        for fy, fw in rows:
            out += f'<rect x="{lx:.1f}" y="{y + h*fy:.1f}" width="{lw*fw:.1f}" height="{max(6, h*0.028):.1f}" rx="2" fill="{line_col}" opacity=".55" {M}/>'
            out += f'<rect x="{lx + lw*0.82:.1f}" y="{y + h*fy:.1f}" width="{lw*0.18:.1f}" height="{max(6, h*0.028):.1f}" rx="2" fill="{line_col}" opacity=".55" {M}/>'
        out += f'<rect x="{lx:.1f}" y="{y + h*0.66:.1f}" width="{lw:.1f}" height="3" fill="{line_col}" opacity=".5" {M}/>'
        out += f'<rect x="{lx:.1f}" y="{y + h*0.71:.1f}" width="{lw*0.4:.1f}" height="{max(8, h*0.04):.1f}" rx="2" fill="{INK}" {M}/>'
        out += f'<rect x="{lx + lw*0.62:.1f}" y="{y + h*0.71:.1f}" width="{lw*0.38:.1f}" height="{max(8, h*0.04):.1f}" rx="2" fill="{INK}" {M}/>'
    return out + extra + '</g>'

icons = {}

# 1 The receipt
icons['icon-a-receipt'] = ('The receipt', 'Just the receipt: a torn till slip, slightly crooked, with a teal plate slipped behind it on a cornflower halftone. Plain and readable at every size.', svg(512, 512,
    f'<rect width="512" height="512" fill="{C["corn"]}"/><rect width="512" height="512" fill="url(#d)"/>'
    + slip(148, 64, 216, 384, plate=(C['teal'], .8), rot=-6) + G,
    dots('d', C['blue'], 12, 3.6, .55) + grain('g', .2)))

# 2 Long receipt (the long list of evidence)
roll_y = 404
icons['icon-b-long'] = ('The long receipt', 'A receipt so long it curls at the bottom: a lot of evidence. Yellow ground, orange plate out of register.', svg(512, 512,
    f'<rect width="512" height="512" fill="{C["yellow"]}"/><rect width="512" height="512" fill="url(#d)"/>'
    f'<g transform="translate(14 10)" fill="{C["orange"]}" opacity=".85" {M}><rect x="168" y="-20" width="176" height="{roll_y + 20}"/><ellipse cx="256" cy="{roll_y}" rx="92" ry="54"/></g>'
    f'<rect x="168" y="-20" width="176" height="{roll_y + 20}" fill="{CREAM}"/>'
    + ''.join(f'<rect x="196" y="{y}" width="{w}" height="9" rx="2" fill="{MID}" opacity=".5" {M}/><rect x="{196 + 120 - 0}" y="{y}" width="24" height="9" rx="2" fill="{MID}" opacity=".5" {M}/>'
              for y, w in [(24, 70), (52, 96), (80, 60), (108, 88), (136, 74), (164, 92), (192, 56), (220, 84), (248, 70), (276, 90)])
    + f'<ellipse cx="256" cy="{roll_y}" rx="92" ry="54" fill="{CREAM}"/>'
    f'<ellipse cx="256" cy="{roll_y}" rx="92" ry="54" fill="url(#sh)" {M}/>'
    f'<path d="M256 {roll_y} m-58 0 a58 32 0 1 1 116 0 a44 24 0 1 1 -88 0 a30 16 0 1 1 60 0" fill="none" stroke="{MID}" stroke-width="5" opacity=".6" {M}/>'
    f'<rect x="196" y="318" width="64" height="12" rx="2" fill="{INK}" {M}/><rect x="292" y="318" width="40" height="12" rx="2" fill="{INK}" {M}/>' + G,
    dots('d', C['orange'], 13, 2.8, .4) + dots('sh', C['orange'], 7, 1.8, .55) + grain('g', .2)))

# 3 Receipt fan: snap it open like a drag fan
fan = ''
cols = [(C['pink'], .9), (C['corn'], 1), (C['yellow'], 1), (C['aqua'], 1), (C['orange'], .9)]
for i, ang in enumerate([-48, -24, 0, 24, 48]):
    fan += slip(214, 150, 84, 260, plate=(cols[i][0], cols[i][1]), off=(7, 5), rot=ang, pivot=(256, 400), teeth=5, lines=True, top=True)
icons['icon-c-fan'] = ('Receipt fan', 'Five receipts snapped open like a drag fan, each with its own ink slipping behind it. The cheekiest of the receipt-only options.', svg(512, 512,
    f'<rect width="512" height="512" fill="{C["pink"]}" opacity=".9"/><rect width="512" height="512" fill="url(#d)"/>'
    + fan + f'<circle cx="256" cy="400" r="18" fill="{INK}" {M}/><circle cx="256" cy="400" r="7" fill="{C["yellow"]}"/>' + G,
    dots('d', C['purple'], 12, 3.4, .45) + grain('g', .2)))

# 4 Spill the tea: teacup whose tea-bag tag is a receipt
cup = (f'<path d="M126 250 H386 C386 350 330 420 256 420 C182 420 126 350 126 250 Z" fill="url(#cd)" {M}/>'
       f'<path d="M126 250 H386 C386 350 330 420 256 420 C182 420 126 350 126 250 Z" fill="{C["teal"]}" opacity=".35" {M}/>'
       f'<path d="M378 280 C440 270 446 352 368 352" fill="none" stroke="{C["teal"]}" stroke-width="22" stroke-linecap="round" {M}/>'
       f'<ellipse cx="256" cy="250" rx="130" ry="26" fill="{C["orange"]}" opacity=".85" {M}/>'
       f'<ellipse cx="256" cy="446" rx="160" ry="16" fill="{C["teal"]}" opacity=".6" {M}/>')
string = f'<path d="M232 250 C222 196 168 170 150 124" fill="none" stroke="{INK}" stroke-width="4" {M}/>'
tag = slip(96, 40, 92, 104, plate=(C['pink'], .9), off=(7, 6), rot=-14, teeth=4, lines=False,
           extra=''.join(f'<rect x="110" y="{y}" width="{w}" height="7" rx="2" fill="{MID}" opacity=".55" {M}/>' for y, w in [(58, 50), (74, 62), (90, 40)])
           + f'<rect x="110" y="110" width="30" height="9" rx="2" fill="{INK}" {M}/><rect x="146" y="110" width="26" height="9" rx="2" fill="{INK}" {M}/>')
icons['icon-d-tea'] = ('Spill the tea', 'A teacup whose tea-bag tag is a receipt. Teal cup, orange tea, fluo pink tag plate. The most obviously in-joke option.', svg(512, 512,
    f'<rect width="512" height="512" fill="{C["lilac"]}"/><rect width="512" height="512" fill="url(#d)"/>'
    + cup + string + tag
    + ''.join(f'<path d="M{x} 210 c-14 -22 14 -34 0 -58" fill="none" stroke="{C["corn"]}" stroke-width="8" stroke-linecap="round" opacity=".9" {M}/>' for x in (270, 310, 350)) + G,
    dots('d', C['purple'], 12, 3, .35) + dots('cd', C['teal'], 9, 3.6, 1) + grain('g', .2)))

# 5 Kiss receipt: receipt signed with a lipstick kiss
lips = ('<path d="M-64 0 C-46 -30 -18 -34 0 -16 C18 -34 46 -30 64 0 C30 8 -30 8 -64 0 Z"/>'
        '<path d="M-64 4 C-30 14 30 14 64 4 C44 44 -44 44 -64 4 Z"/>')
creases = ''.join(f'<path d="M{x} {-8 if abs(x) < 40 else -2} L{x*1.05:.0f} {20 - abs(x)//6}" stroke="{CREAM}" stroke-width="1.6" opacity=".55"/>' for x in (-48, -36, -24, -12, 0, 12, 24, 36, 48))
kiss = (f'<g transform="translate(300 404) rotate(-12) scale(.85)"><g transform="translate(6 5)" fill="{C["orange"]}" opacity=".8" {M}>{lips}</g>'
        f'<g fill="{C["pink"]}" {M}>{lips}</g>{creases}</g>')
icons['icon-e-kiss'] = ('Signed with a kiss', 'A receipt sealed with a fluo pink lipstick kiss, orange plate slipping behind the lips. Flirty, still clearly a receipt.', svg(512, 512,
    f'<rect width="512" height="512" fill="{PAPER}"/><rect width="512" height="512" fill="url(#d)"/>'
    + slip(146, 54, 220, 392, plate=(C['corn'], 1), rot=4) + kiss + G,
    dots('d', C['pink'], 13, 2.6, .35) + grain('g', .18)))

# 6 Clutch: receipts spilling out of an evening clutch
clutch = (f'<g transform="translate(10 8)" fill="{C["purple"]}" opacity=".55" {M}><path d="M96 262 H416 L398 438 Q396 452 382 452 H130 Q116 452 114 438 Z"/></g>'
          f'<path d="M96 262 H416 L398 438 Q396 452 382 452 H130 Q116 452 114 438 Z" fill="url(#pd)" {M}/>'

          f'<path d="M96 262 H416 L256 352 Z" fill="{C["pink"]}" opacity=".9" {M}/>'
          f'<circle cx="256" cy="350" r="16" fill="{C["yellow"]}" {M}/><circle cx="256" cy="350" r="16" fill="none" stroke="{INK}" stroke-width="4" {M}/>')
icons['icon-f-clutch'] = ('Receipts in the clutch', 'An evening clutch stuffed with receipts, ready to pull one out. Pink halftone bag, purple plate, aqua ground.', svg(512, 512,
    f'<rect width="512" height="512" fill="{C["aqua"]}"/><rect width="512" height="512" fill="url(#d)"/>'
    + slip(150, 70, 110, 240, plate=(C['corn'], 1), off=(8, 6), rot=-12, teeth=5, top=True)
    + slip(240, 54, 120, 260, plate=(C['orange'], .85), off=(8, 6), rot=9, teeth=5, top=True)
    + clutch + G,
    dots('d', C['teal'], 12, 3, .4) + dots('pd', C['pink'], 9, 3.4, 1) + grain('g', .2)))

for k, (_, _, s) in icons.items():
    open(f'{k}.svg', 'w').write(s)
json.dump({k: v[:2] for k, v in icons.items()}, open('meta2.json', 'w'), indent=1)
html = '<body style="margin:0;background:#ebe5da;display:flex;flex-wrap:wrap;gap:16px;padding:16px;width:1100px">' + ''.join(
    f'<div><img src="{k}.svg" style="width:340px;height:340px;border-radius:76px"><div style="display:flex;gap:10px;align-items:end"><img src="{k}.svg" style="width:60px;height:60px;border-radius:13px"><img src="{k}.svg" style="width:32px;height:32px;border-radius:7px"><span style="font:12px sans-serif">{k}</span></div></div>' for k in icons) + '</body>'
open('sheet2.html', 'w').write(html)

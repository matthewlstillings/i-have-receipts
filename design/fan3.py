"""Fan 3 iterations: centered, fluo pink as one of the two ground inks."""
import json
from riso_svgs import C, PAPER, M, grain, svg, dots
from fan import fan, rivet, G, RX

def ground(a, b, inset=12):
    w = 512 - inset * 2
    return (f'<rect width="512" height="512" fill="{PAPER}"/>'
            f'<rect x="{inset}" y="{inset}" width="{w}" height="{w}" rx="{RX}" fill="{a[0]}" opacity="{a[1]}" transform="translate(-6 -5)" {M}/>'
            f'<rect x="{inset}" y="{inset}" width="{w}" height="{w}" rx="{RX}" fill="{b[0]}" opacity="{b[1]}" transform="translate(6 5)" {M}/>')

# Fan 3 drawing, moved up so the whole fan (top teeth to pin) sits on the middle line
body = fan(7, 72, [(C['pink'], .9), (C['yellow'], 1)], x0=220, y0=170, w=72, h=240, pivot=(256, 410)) + rivet(256, 410)
body = f'<g transform="translate(256 256) scale(.86) translate(-256 -256) translate(0 -74)">{body}</g>'

V = {
 'fan3-teal-pink': ('Teal + fluo pink', 'Teal slipped up-left, fluo pink down-right. Where they overprint they make a deep blue, with a pink and teal edge showing.', (C['teal'], 1), (C['pink'], .9)),
 'fan3-blue-pink': ('Blue + fluo pink', 'Riso blue up-left, fluo pink down-right: an inky violet-blue with hot pink edges.', (C['blue'], 1), (C['pink'], .85)),
 'fan3-corn-pink': ('Cornflower + fluo pink', 'Cornflower up-left, fluo pink down-right: a brighter purple-blue. The lightest of the three.', (C['corn'], 1), (C['pink'], .85)),
 'fan3-corn-teal': ('Cornflower + teal (current)', 'The primary button inks from the last round, recentred, for comparison.', (C['corn'], 1), (C['teal'], .56)),
}
meta = {}
for k, (name, desc, a, b) in V.items():
    open(f'{k}.svg', 'w').write(svg(512, 512, ground(a, b) + body + G, grain('g', .2)))
    meta[k] = (name, desc)
json.dump(meta, open('meta4.json', 'w'), indent=1)
open('sheet4.html', 'w').write('<body style="margin:0;background:#ebe5da;display:flex;flex-wrap:wrap;gap:16px;padding:16px;width:1460px">' + ''.join(
    f'<div><img src="{k}.svg" style="width:340px;height:340px"><div style="display:flex;gap:10px;align-items:end"><img src="{k}.svg" style="width:60px;height:60px;border-radius:13px"><span style="font:12px sans-serif">{k}</span></div></div>' for k in V) + '</body>')

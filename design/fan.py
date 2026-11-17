"""Fan icon iterations: primary-blue two-ink ground, app corner radius."""
import json, math
from riso_svgs import C, PAPER, CREAM, INK, MID, M, grain, svg, dots
from riso_icons import slip

G = '<rect width="512" height="512" filter="url(#g)" ' + M + '/>'
RX = 8   # 4px app corners at 256px; the OS mask rounds further on the home screen

def ground(inset=12):
    """The primary button's two inks: cornflower up-left, teal 56% down-right, multiplied."""
    w = 512 - inset * 2
    return (f'<rect width="512" height="512" fill="{PAPER}"/>'
            f'<rect x="{inset}" y="{inset}" width="{w}" height="{w}" rx="{RX}" fill="{C["corn"]}" transform="translate(-6 -5)" {M}/>'
            f'<rect x="{inset}" y="{inset}" width="{w}" height="{w}" rx="{RX}" fill="{C["teal"]}" opacity=".56" transform="translate(6 5)" {M}/>')

def fan(n, spread, plates, x0=214, y0=150, w=84, h=260, pivot=(256, 400), lines=True, fill=CREAM, extra_mid=''):
    out = ''
    for i in range(n):
        ang = -spread + 2 * spread * i / (n - 1)
        # riso inks print on paper, not on the blue: knock a paper shape out under each plate
        out += f'<g transform="translate(7 5)">' + slip(x0, y0, w, h, fill=PAPER, rot=ang, pivot=pivot, teeth=5, lines=False, top=True) + '</g>'
        out += slip(x0, y0, w, h, fill=fill, plate=plates[i % len(plates)], off=(7, 5), rot=ang, pivot=pivot, teeth=5, lines=lines, top=True,
                    extra=extra_mid if i == n // 2 else '')
    return out

def rivet(cx=256, cy=400, r=18):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{INK}" {M}/><circle cx="{cx}" cy="{cy}" r="{r*0.4:.1f}" fill="{C["yellow"]}"/>'

LIPS = ('<path d="M-64 0 C-46 -30 -18 -34 0 -16 C18 -34 46 -30 64 0 C30 8 -30 8 -64 0 Z"/>'
        '<path d="M-64 4 C-30 14 30 14 64 4 C44 44 -44 44 -64 4 Z"/>')

V = {}
rainbow = [(C['pink'], .9), (C['yellow'], 1), (C['orange'], .9), (C['aqua'], 1), (C['lilac'], 1)]
V['fan-1-five'] = ('Five-ink fan', 'The fan you picked, now on the primary blue: five receipts, each with its own ink slipping behind.', fan(5, 48, rainbow) + rivet())
V['fan-2-orange'] = ('One-ink fan', 'Calmer: every receipt has the same orange plate. Reads as one object at small sizes.', fan(5, 48, [(C['orange'], .9)]) + rivet())
V['fan-3-full'] = ('Full fan', 'Seven receipts snapped all the way open, like a fan at the end of a read.',
                   fan(7, 72, [(C['pink'], .9), (C['yellow'], 1)], x0=220, y0=170, w=72, h=240, pivot=(256, 410)) + rivet(256, 410))
V['fan-4-three'] = ('Three big receipts', 'Only three receipts, drawn bigger, so the lines still show at 60px.',
                    fan(3, 30, [(C['pink'], .9), (C['yellow'], 1), (C['orange'], .9)], x0=196, y0=110, w=120, h=300, pivot=(256, 420)) + rivet(256, 420, 20))
kiss = (f'<g transform="translate(256 262) scale(.6)"><g transform="translate(8 6)" fill="{C["orange"]}" opacity=".8" {M}>{LIPS}</g>'
        f'<g fill="{C["pink"]}" {M}>{LIPS}</g></g>')
V['fan-5-kiss'] = ('Fan with a kiss', 'The fan with a fluo pink lipstick kiss on the middle receipt. The cheekiest version.',
                   fan(5, 48, [(C['yellow'], 1)], extra_mid=kiss) + rivet())
tassel_paper = None
tassel = (f'<path d="M256 418 C256 440 250 452 244 470" fill="none" stroke="{C["pink"]}" stroke-width="6" {M}/>'
          + ''.join(f'<path d="M244 466 l{dx} 30" stroke="{C["pink"]}" stroke-width="5" stroke-linecap="round" {M}/>' for dx in (-10, -4, 2, 8))
          + f'<circle cx="244" cy="468" r="8" fill="{C["yellow"]}" {M}/>')
V['fan-6-tassel'] = ('Fan with a tassel', 'The five-ink fan with a pink tassel hanging from the rivet. Extra, on purpose.',
                     fan(5, 48, rainbow, y0=130, pivot=(256, 380)) + rivet(256, 380) + tassel.replace('418', '398').replace('466', '446').replace('468', '448').replace('470', '450').replace(f'stroke="{C["pink"]}"', f'stroke="{CREAM}"').replace(M, '').replace(f'fill="{C["yellow"]}"', f'fill="{CREAM}"')
                     + tassel.replace('418', '398').replace('466', '446').replace('468', '448').replace('470', '450'))

out = {}
for k, (name, desc, body) in V.items():
    s = svg(512, 512, ground() + body + G, dots('d', C['blue'], 12, 3, .3) + grain('g', .2))
    open(f'{k}.svg', 'w').write(s)
    out[k] = (name, desc)
json.dump(out, open('meta3.json', 'w'), indent=1)
html = '<body style="margin:0;background:#ebe5da;display:flex;flex-wrap:wrap;gap:16px;padding:16px;width:1100px">' + ''.join(
    f'<div><img src="{k}.svg" style="width:340px;height:340px"><div style="display:flex;gap:10px;align-items:end"><img src="{k}.svg" style="width:60px;height:60px;border-radius:13px"><img src="{k}.svg" style="width:32px;height:32px;border-radius:7px"><span style="font:12px sans-serif">{k}</span></div></div>' for k in V) + '</body>'
open('sheet3.html', 'w').write(html)

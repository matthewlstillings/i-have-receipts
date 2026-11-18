"""Riso app icon + default avatar options for Keeping Receipts (Overprint)."""
import math, random, re
R_PATH = open('/tmp/glyph_82.txt').read()
D_PATH = open('/tmp/glyph_36.txt').read()
PAPER, CREAM, INK, MID = '#f5f0e8', '#faf6ee', '#2a2a2a', '#435060'
C = dict(corn='#62a8e5', teal='#00838a', aqua='#80f2ff', lilac='#ccbcfc', coral='#ff7477', orange='#ff6c2f',
         pink='#ff48b0', hunter='#407060', red='#f15060', yellow='#ffe800', blue='#0078bf', purple='#765ba7',
         gold='#bb8b41', midnight=MID, ink=INK)
M = 'style="mix-blend-mode:multiply"'

def grain(fid, op=0.16, seed=3):
    # paper speckle: only the strongest noise peaks print, faintly
    return (f'<filter id="{fid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="{seed}"/>'
            f'<feColorMatrix values="0 0 0 0 0.26  0 0 0 0 0.26  0 0 0 0 0.26  0 0 0 {op*9:.2f} -{op*5.6:.2f}"/></filter>')

def glyph(path, x, y, h, color, op=1.0, extra=''):
    # Syne units: cap height ~640 on 1000 em; place baseline at y, cap height h
    s = h / 640
    return f'<path d="{path}" transform="translate({x:.1f} {y:.1f}) scale({s:.4f} {-s:.4f})" fill="{color}" opacity="{op}" {M} {extra}/>'

def svg(w, h, body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{defs}</defs><g style="isolation:isolate">{body}</g></svg>'

def dots(fid, color, cell, r, op=1, angle=45):
    return (f'<pattern id="{fid}" width="{cell}" height="{cell}" patternUnits="userSpaceOnUse" patternTransform="rotate({angle})">'
            f'<circle cx="{cell/2}" cy="{cell/2}" r="{r}" fill="{color}" opacity="{op}"/></pattern>')

R_W = 1094 / 640   # R width per cap height (bounds 70..1164)
def r_at(cx, base, h, color, op=1.0, extra=''):
    x = cx - (70 + 1094 / 2) * h / 640
    return glyph(R_PATH, x, base, h, color, op, extra)

# ------------------------------------------------------------------ icons (512)
icons = {}
G = '<rect width="512" height="512" filter="url(#g)" ' + M + '/>'

# 1 Misprint R: three plates out of register
icons['icon-1-misprint'] = ('Misprint R', 'The wordmark letter printed in three inks that slipped: cornflower up-left, orange down-right, ink on top. Closest to the misprinted "E" you approved.', svg(512, 512,
    f'<rect width="512" height="512" fill="{PAPER}"/><rect width="512" height="512" fill="url(#d)"/>'
    + r_at(256 - 14, 352 - 12, 214, C['corn']) + r_at(256 + 12, 352 + 9, 214, C['orange'], .85) + r_at(256, 352, 214, INK) + G,
    dots('d', C['corn'], 14, 3.2, .35) + grain('g')))

# 2 Receipt: torn receipt slip with R
zig = ' '.join(f'L{132 + i*24 + 12:.0f} {446 if i % 2 == 0 else 430}' for i in range(10))
slip = f'M132 70 H380 V430 {zig.replace("L", "L", 1)} L380 446 Z'
pts = [(132, 70), (380, 70), (380, 430)]
teeth = []
for i in range(10, -1, -1):
    teeth.append((132 + i * 24.8, 446 if i % 2 else 428))
poly = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts + teeth)
lines = ''.join(f'<rect x="168" y="{y}" width="{w}" height="10" rx="2" fill="{MID}" opacity=".55" {M}/>' for y, w in [(318, 176), (346, 120), (374, 150)])
icons['icon-2-receipt'] = ('Receipt slip', 'A torn till receipt on a cornflower halftone, with the R printed in ink and a teal plate slipped behind. Says "receipts" at a glance.', svg(512, 512,
    f'<rect width="512" height="512" fill="{C["corn"]}"/><rect width="512" height="512" fill="url(#d)"/>'
    f'<polygon points="{poly}" transform="translate(14 12)" fill="{C["teal"]}" opacity=".75" {M}/>'
    f'<polygon points="{poly}" fill="{CREAM}"/>'
    + r_at(262, 262, 104, C['orange'], .9)
    + r_at(256, 256, 104, INK) + lines + G,
    dots('d', C['blue'], 12, 3.6, .55) + grain('g', .2)))
# fix: orange plate offset for receipt R


# 3 Stamp: "PAID"-style rubber stamp ring with R
ring_text_r = 168
def arc_text():
    return (f'<path id="arc" d="M256 256 m-{ring_text_r},0 a{ring_text_r},{ring_text_r} 0 1,1 {ring_text_r*2},0 a{ring_text_r},{ring_text_r} 0 1,1 -{ring_text_r*2},0"/>')
icons['icon-3-stamp'] = ('Rubber stamp', 'A slightly crooked "settled" stamp in fluorescent red ink with an uneven, grainy print, over a lilac paper tint.', svg(512, 512,
    f'<rect width="512" height="512" fill="{PAPER}"/><rect width="512" height="512" fill="{C["lilac"]}" opacity=".45" {M}/>'
    f'<g transform="rotate(-9 256 256)" mask="url(#wear)">'
    f'<circle cx="256" cy="256" r="196" fill="none" stroke="{C["red"]}" stroke-width="22" {M}/>'
    f'<circle cx="256" cy="256" r="150" fill="none" stroke="{C["red"]}" stroke-width="8" {M}/>'
    + r_at(256, 330, 150, C['red']) +
    ''.join(f'<circle cx="{256 + 173*math.cos(a):.1f}" cy="{256 + 173*math.sin(a):.1f}" r="7" fill="{C["red"]}" {M}/>' for a in [math.radians(d) for d in range(0, 360, 30)]) +
    '</g>' + G,
    grain('g', .18) + '<filter id="wf"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="8"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.7"/></filter>'
    '<mask id="wear"><rect width="512" height="512" fill="#fff"/><rect width="512" height="512" filter="url(#wf)" fill="#000" style="mix-blend-mode:normal"/></mask>'))

# 4 Owe / owed: hunter and pink discs overlapping, R knocked out in paper
icons['icon-4-balance'] = ('Owed and owe', 'Two ink discs, hunter (owed) and fluo pink (you owe), overprinting where they meet, with the R knocked out to paper. Uses the app\'s money colors.', svg(512, 512,
    f'<rect width="512" height="512" fill="{PAPER}"/>'
    f'<circle cx="196" cy="236" r="150" fill="url(#hd)" {M}/>'
    f'<circle cx="316" cy="276" r="150" fill="{C["pink"]}" opacity=".85" {M}/>'
    f'<circle cx="196" cy="236" r="150" fill="{C["hunter"]}" opacity=".75" {M}/>'
    + r_at(256, 330, 150, CREAM).replace(M, '') + G,
    dots('hd', C['hunter'], 10, 3.4, 1) + grain('g', .2)))

# 5 Halftone R: dotted blue R over a solid yellow offset R
icons['icon-5-halftone'] = ('Halftone R', 'A big R in blue halftone dots over a fluo pink R that slipped down-right. Loud and simple; reads well even at small sizes.', svg(512, 512,
    f'<rect width="512" height="512" fill="{PAPER}"/>'
    + r_at(268, 364, 220, C['pink'], .9) + r_at(250, 350, 220, 'url(#bd)') + G,
    dots('bd', C['blue'], 10, 3.6, 1) + grain('g', .18)))

for k, (_, _, s) in icons.items():
    open(f'{k}.svg', 'w').write(s)

# ------------------------------------------------------------------ avatars (256)
# Generic person: head circle + shoulders, cropped by the avatar circle.
HEAD = (128, 104, 46)        # cx, cy, r
def in_body(x, y):
    hx, hy, hr = HEAD
    if (x - hx) ** 2 + (y - hy) ** 2 <= hr ** 2: return True
    # shoulders: top half of an ellipse centered (128, 262), rx 98, ry 104
    return ((x - 128) / 98) ** 2 + ((y - 262) / 104) ** 2 <= 1 and y >= 158
def tone(x, y):
    # soft light from the top-left, like the tone curve on a real portrait
    hx, hy, hr = HEAD
    if (x - hx) ** 2 + (y - hy) ** 2 <= hr ** 2:
        lx, ly = (x - (hx - 18)) / hr, (y - (hy - 20)) / hr        # head: lit spot up-left
        t = 0.18 + 0.42 * math.hypot(lx, ly)
    else:
        lx = (x - 92) / 120; ly = (y - 170) / 90                    # shoulders: lit up-left
        t = 0.38 + 0.38 * math.hypot(lx, ly)
        if y < 182 and abs(x - 128) < 34: t += 0.25                 # shadow under the chin
    return max(0, min(1, t))
BODY = (f'<circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]}"/>'
        f'<path d="M30 262 A98 104 0 0 1 226 262 Z" transform="translate(0 0)"/>')
SHOULDER = 'M30 262 A98 104 0 0 1 226 262 Z'

def body_shape(fill, op=1, dx=0, dy=0, extra=''):
    return (f'<g transform="translate({dx} {dy})" fill="{fill}" opacity="{op}" {M} {extra}>'
            f'<circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]}"/><path d="{SHOULDER}"/></g>')

def halftone_key(color, cell=4.6, ang=45, solid=0.97):
    out = []
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    n = int(400 / cell)
    for i in range(-n, n):
        for j in range(-n, n):
            u, v = (i + .5) * cell, (j + .5) * cell
            x, y = 128 + u * ca - v * sa, 128 + u * sa + v * ca
            if not (0 <= x <= 256 and 0 <= y <= 256) or not in_body(x, y): continue
            t = tone(x, y)
            if t >= solid: continue
            r = cell * 0.74 * math.sqrt(t)
            if r > 0.3: out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.2f}"/>')
    return f'<g fill="{color}" {M}>' + ''.join(out) + '</g>'

def solid_key(color):
    # the shadow areas print solid (tone >= .86): approximate with the body clipped to a lower-right half-plane
    return (f'<g clip-path="url(#shadow)">{body_shape(color)}</g>')

SETS = {
    'A': ('Ink', INK, (C['yellow'], 1), (C['orange'], 1), (C['yellow'], .35)),
    'B': ('Midnight', MID, (C['corn'], 1), (C['pink'], .9), (C['corn'], .35)),
    'C': ('Teal', INK, (C['teal'], .85), (C['orange'], 1), (C['teal'], .22)),
    'D': ('Purple', C['purple'], (C['pink'], .9), (C['yellow'], 1), (C['lilac'], .6)),
    'E': ('Hunter', C['hunter'], (C['gold'], .9), (C['coral'], 1), (C['gold'], .3)),
    'F': ('Blue', C['blue'], (C['orange'], .9), (C['aqua'], 1), (C['aqua'], .6)),
    'G': ('Pink', INK, (C['pink'], .85), (C['corn'], 1), (C['pink'], .22)),
}

def avatar(set_key, style='halftone'):
    name, key, rim1, rim2, tint = SETS[set_key]
    defs = (grain('g', .14) + '<clipPath id="c"><circle cx="128" cy="128" r="128"/></clipPath>'
            '<clipPath id="shadow"><path d="M256 120 L256 256 L60 256 Z"/><circle cx="150" cy="128" r="22"/></clipPath>')
    body = f'<g clip-path="url(#c)"><rect width="256" height="256" fill="{PAPER}"/>'
    body += f'<rect width="256" height="256" fill="{tint[0]}" opacity="{tint[1]}" {M}/>'
    if style == 'halftone':
        body += body_shape(rim1[0], rim1[1], -4.5, -4.5)
        body += body_shape(rim2[0], rim2[1], 4.5, 2.7)
        body += f'<g opacity="0">{body_shape(PAPER)}</g>'
        body += body_shape(PAPER).replace(M, '')            # knock the figure out to paper first
        body += f'<g {M}>' + body_shape(rim1[0], rim1[1] * .35) + '</g>'
        body += halftone_key(key)
    elif style == 'solid':
        body += body_shape(rim1[0], rim1[1], -5, -5) + body_shape(rim2[0], rim2[1], 5, 3)
        body += body_shape(PAPER).replace(M, '')   # rims only peek out at the edges
        body += body_shape(key, .95)
    else:  # outline
        body += (f'<g fill="none" stroke-width="10" stroke-linejoin="round">'
                 f'<g stroke="{rim1[0]}" opacity="{rim1[1]}" transform="translate(-4 -4)" {M}><circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]-5}"/><path d="M40 262 A88 96 0 0 1 216 262"/></g>'
                 f'<g stroke="{rim2[0]}" opacity="{rim2[1]}" transform="translate(4 3)" {M}><circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]-5}"/><path d="M40 262 A88 96 0 0 1 216 262"/></g>'
                 f'<g stroke="{key}" {M}><circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]-5}"/><path d="M40 262 A88 96 0 0 1 216 262"/></g></g>')
    body += '<rect width="256" height="256" filter="url(#g)" ' + M + '/></g>'
    return svg(256, 256, body, defs)

avatars = {}
for k in 'ABDFG':
    avatars[f'avatar-{k}-halftone'] = (f'Halftone · set {k} ({SETS[k][0]})', 'The upload treatment on a generic person: halftone key ink, two rim inks peeking out, tint behind.', avatar(k))
avatars['avatar-C-solid'] = ('Solid · set C (Teal)', 'Flatter: one solid key plate with the two rims, no dots. Calmer at 32px.', avatar('C', 'solid'))
avatars['avatar-E-outline'] = ('Outline · set E (Hunter)', 'Just the outline, printed three times out of register. Lightest; clearly reads as "no photo yet".', avatar('E', 'outline'))
for k, (_, _, s) in avatars.items():
    open(f'{k}.svg', 'w').write(s)
import json
json.dump({'icons': {k: v[:2] for k, v in icons.items()}, 'avatars': {k: v[:2] for k, v in avatars.items()}}, open('meta.json', 'w'), indent=1)
print(len(icons), len(avatars))

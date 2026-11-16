// Overprint building blocks. Each one prints the same markup as the matching
// helper in design/gen/ui.py, so the app looks like the canvas boards.
import { useEffect, useRef, type CSSProperties, type ReactNode, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { PH, BOLD, STROKE, CAT_INK } from './iconData.ts'
import type { Profile } from '../data/types.ts'
import { initials } from '../data/logic.ts'
import { useLayout } from './layout.ts'

// ---------------------------------------------------------------- icons
export function Ph({ name, size = 22, ink, op = 0.9 }: { name: string; size?: number; ink?: string; op?: number }) {
  const p = PH[name]
  if (!p) return <Stroke name="receipt" size={size} />
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d={p[0]} style={ink ? { fill: ink, opacity: op, mixBlendMode: 'multiply' } : { opacity: 0.18 }} />
      <path d={p[1]} />
    </svg>
  )
}
export function Bold({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d={BOLD[name]} /></svg>
}
export function Stroke({ name, size = 20, w = 2 }: { name: string; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: STROKE[name] }} />
  )
}
export const Next = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z" />
  </svg>
)
export const CalDuo = () => (
  <svg width="20" height="20" viewBox="0 0 256 256" fill="var(--ink)" aria-hidden="true">
    <path d="M216,48V88H40V48a8,8,0,0,1,8-8H208A8,8,0,0,1,216,48Z" style={{ fill: 'var(--corn)', mixBlendMode: 'multiply' }} />
    <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
  </svg>
)

// ---------------------------------------------------------------- atoms
export function Av({ p, size = 40, off }: { p?: Profile; size?: 28 | 32 | 40 | 56 | 80; off?: boolean }) {
  const isOff = off ?? p?.status === 'off'
  const url = p?.avatar_path && /^https?:/.test(p.avatar_path) ? p.avatar_path : null
  return (
    <span className={`av ini s${size}${isOff ? ' off' : ''}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials(p?.display_name ?? '?')}
    </span>
  )
}

export function Tile({ cat, size = 40 }: { cat: string; size?: number }) {
  const [ink, op] = CAT_INK[cat] ?? CAT_INK.uncategorized
  const st: CSSProperties | undefined = size !== 40 && size !== 56 ? { width: size, height: size } : undefined
  return (
    <span className={size >= 56 ? 'ct lg' : 'ct'} style={st}>
      <i style={{ ['--k' as any]: ink, ['--a' as any]: op }} />
      <Ph name={cat} size={size <= 40 ? 22 : 28} ink={ink} op={Math.min(1, op + 0.25)} />
    </span>
  )
}
export const PayTile = ({ size = 40 }: { size?: number }) => (
  <span className="ct pay" style={{ width: size, height: size }}><i /><Stroke name="handshake" size={22} /></span>
)

type BtnKind = 'pri' | 'sec' | 'dan' | 'dis' | 'txt'
export function Btn({ children, kind = 'pri', icon, wide, sm, busy, disabled, onClick, to, type = 'button', style, label }: {
  children?: ReactNode; kind?: BtnKind; icon?: ReactNode; wide?: boolean; sm?: boolean; busy?: boolean; disabled?: boolean
  onClick?: (e: MouseEvent) => void; to?: string; type?: 'button' | 'submit'; style?: CSSProperties; label?: string
}) {
  const k: BtnKind = disabled && kind !== 'txt' ? 'dis' : kind
  const cls = `rb ${k}${wide ? ' wide' : ''}${sm ? ' sm' : ''}${busy ? ' busy' : ''}`
  const inner = k === 'txt'
    ? <span>{icon}{children}</span>
    : <><i className="l1" /><i className="l2" /><span>{icon}{busy ? 'Saving' : children}</span></>
  if (to) return <Link className={cls} to={to} style={{ textDecoration: 'none', ...style }} aria-label={label}>{inner}</Link>
  return (
    <button type={type} className={cls} style={style} aria-label={label} aria-disabled={disabled || busy || undefined}
      onClick={(e) => { if (disabled || busy) { e.preventDefault(); return } onClick?.(e) }}>{inner}</button>
  )
}

export const Label = ({ children }: { children: ReactNode }) => <span className="label">{children}</span>
export const Mis = ({ text, cls = 'title', ink = '' }: { text: string; cls?: string; ink?: string }) => (
  <span className={`${cls} mis ${ink}`} data-t={text}>{text}</span>
)
export const Mk = ({ kind, style }: { kind: 'owed' | 'owe' | 'none'; style?: CSSProperties }) => <b className={`mk ${kind}`} style={style} />
export const Settled = ({ big }: { big?: boolean }) => (
  <span className={`settled${big ? ' big' : ''}`}><span className="sp">Settled</span><i className="s1">Settled</i><i className="s2" aria-hidden="true">Settled</i></span>
)

// ---------------------------------------------------------------- bars
export function TopBar({ left = 'back', title = '', right, onLeft, rightText, onRight, rightOff, more }: {
  left?: 'back' | 'close' | null; title?: string; right?: 'more' | 'text' | null; onLeft?: () => void
  rightText?: string; onRight?: () => void; rightOff?: boolean; more?: () => void
}) {
  const l = left === 'back'
    ? <button type="button" className="ib" aria-label="Back" onClick={onLeft}><Bold name="back" /></button>
    : left === 'close'
      ? <button type="button" className="ib" aria-label="Close" onClick={onLeft}><Stroke name="x" size={22} /></button>
      : <span className="ib ghost" />
  const r = right === 'more'
    ? <button type="button" className="ib" aria-label="More" onClick={more}><Bold name="more" size={22} /></button>
    : right === 'text'
      ? <button type="button" className={`txt${rightOff ? ' off' : ''}`} aria-disabled={rightOff || undefined} onClick={() => !rightOff && onRight?.()}>{rightText}</button>
      : <span className="ib ghost" />
  return <div className="tb">{l}<span className="t">{title}</span>{r}</div>
}

const TABS = [['friends', 'Friends'], ['groups', 'Groups'], ['activity', 'Activity'], ['account', 'Account']] as const

export function TabBar({ active }: { active: string }) {
  return (
    <nav className="tbar" aria-label="Main">
      {TABS.map(([k, n]) => (
        <Link key={k} to={`/${k}`} className={`tab${active === k ? ' on' : ''}`} aria-current={active === k ? 'page' : undefined}>
          <Ph name={k} size={24} ink={active === k ? 'var(--corn)' : undefined} op={1} /><b>{n}</b>
        </Link>
      ))}
    </nav>
  )
}
export function Rail({ active }: { active: string }) {
  return (
    <nav className="rail" aria-label="Main">
      <span className="mark" role="img" aria-label="Receipts">R</span>
      {TABS.map(([k, n]) => (
        <Link key={k} to={`/${k}`} className={`rtab${active === k ? ' on' : ''}`} aria-current={active === k ? 'page' : undefined}>
          <Ph name={k} size={24} ink={active === k ? 'var(--corn)' : undefined} op={1} /><b>{n}</b>
        </Link>
      ))}
    </nav>
  )
}

export function Fab({ text, off, minimal, onClick }: { text: string; off?: boolean; minimal?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`rb ${off ? 'dis' : 'pri'} fab${minimal ? ' min' : ''}`} aria-label={text}
      aria-disabled={off || undefined} onClick={() => !off && onClick?.()}>
      <i className="l1" /><i className="l2" /><span><Bold name="plus" size={16} />{minimal ? '' : text}</span>
    </button>
  )
}

export const OfflineBar = () => (
  <div className="warn" role="status"><Stroke name="offline" size={20} /><span><b>You're offline.</b> You can look around; adding and settling wait until you're back.</span></div>
)

// ---------------------------------------------------------------- overlays
function useEscape(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}
function useFocusIn<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => prev?.focus?.()
  }, [])
  return ref
}

/** Bottom sheet on phones; a centered panel on tablets (V-08). */
export function Sheet({ title, onClose, children, width = 480 }: { title?: string; onClose: () => void; children: ReactNode; width?: number }) {
  const { tablet } = useLayout()
  useEscape(onClose)
  const ref = useFocusIn<HTMLDivElement>()
  if (tablet) return <Panel title={title} onClose={onClose} width={width} small>{children}</Panel>
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title ?? 'Menu'} ref={ref} tabIndex={-1}>
        <div className="body">
          <span className="grab" />
          {title && <div className="shd"><span className="sub">{title}</span>
            <button type="button" className="ib" aria-label="Close" onClick={onClose}><Stroke name="x" size={22} /></button></div>}
          {children}
        </div>
      </div>
    </>
  )
}

export function Panel({ title, onClose, children, width = 560, small }: { title?: string; onClose: () => void; children: ReactNode; width?: number; small?: boolean }) {
  useEscape(onClose)
  const ref = useFocusIn<HTMLDivElement>()
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="panel" role="dialog" aria-modal="true" aria-label={title ?? 'Panel'} style={{ width: `min(${width}px, calc(100vw - 48px))` }} ref={ref} tabIndex={-1}>
        <div className="body">
          {title && <div className="shd"><span className={small ? 'sub' : 'heading'}>{title}</span>
            <button type="button" className="ib" aria-label="Close" onClick={onClose}><Stroke name="x" size={22} /></button></div>}
          {children}
        </div>
      </div>
    </>
  )
}

export function Dialog({ title, text, cancel = 'Cancel', confirm, danger = true, busy, onCancel, onConfirm }: {
  title: string; text: ReactNode; cancel?: string; confirm: string; danger?: boolean; busy?: boolean; onCancel: () => void; onConfirm: () => void
}) {
  useEscape(onCancel)
  const ref = useFocusIn<HTMLDivElement>()
  const { tablet } = useLayout()
  return (
    <>
      <div className="dim" onClick={onCancel} />
      <div className="dlg" role="alertdialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}
        style={tablet ? { left: '50%', right: 'auto', width: 420, transform: 'translate(-50%,-50%)' } : undefined}>
        <div className="plate" style={danger ? undefined : { background: 'var(--corn)' }} />
        <div className="body">
          <span className="sub">{title}</span>
          <p className="small" style={{ color: 'var(--ink)' }}>{text}</p>
          <div className="btns"><Btn kind="txt" onClick={onCancel}>{cancel}</Btn><Btn kind={danger ? 'dan' : 'pri'} busy={busy} onClick={onConfirm}>{confirm}</Btn></div>
        </div>
      </div>
    </>
  )
}

export interface MenuItem { icon: ReactNode; text: string; why?: string; off?: boolean; danger?: boolean; onClick?: () => void }
export function MenuRows({ rows }: { rows: MenuItem[] }) {
  return (
    <div className="list">
      {rows.map((r) => (
        <button key={r.text} type="button" className={`mrow${r.off ? ' off' : ''}${r.danger ? ' danger' : ''}`}
          aria-disabled={r.off || undefined} onClick={() => !r.off && r.onClick?.()}>
          {r.icon}<span>{r.text}{r.why && <span className="why">{r.why}</span>}</span>
        </button>
      ))}
    </div>
  )
}
export const DangerMark = () => <b className="mk" style={{ background: 'var(--red)', width: 12, height: 12 }} />

// ---------------------------------------------------------------- rows
export function Art({ kind = 'friends' }: { kind?: 'friends' | 'sun' }) {
  if (kind === 'sun') return (
    <div className="art" aria-hidden="true">
      <i style={{ left: 60, top: 10, width: 110, height: 110, background: 'radial-gradient(var(--orange) 40%,transparent 46%) 0 0/6px 6px', opacity: 0.85 }} />
      <i style={{ left: 30, top: 40, width: 70, height: 70, background: 'var(--lilac)' }} />
    </div>
  )
  return (
    <div className="art" aria-hidden="true">
      <i style={{ left: 34, top: 8, background: 'var(--corn)' }} />
      <i style={{ left: 86, top: 8, background: 'var(--coral)' }} />
      <i style={{ left: 60, top: 50, background: 'var(--aqua)' }} />
    </div>
  )
}
export const Empty = ({ title, text, children, kind = 'friends', style }: { title: string; text: string; children?: ReactNode; kind?: 'friends' | 'sun'; style?: CSSProperties }) => (
  <div className="empty" style={style}><Art kind={kind} /><span className="sub">{title}</span><p>{text}</p>{children}</div>
)
export function SkelRows({ n = 5 }: { n?: number }) {
  return (
    <div className="list sk" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div className="row" key={i}><span className="skt" /><span className="skl"><i /><i /></span><span className="ska"><i /><i /></span></div>
      ))}
    </div>
  )
}
export function Amount({ kind, amount, label }: { kind: 'owed' | 'owe'; amount: string; label: string }) {
  return <span className="ra"><span className="rv"><Mk kind={kind} />{amount}</span><span className="rl">{label}</span></span>
}
export const Chev = () => <span className="chev"><Stroke name="right" size={18} /></span>

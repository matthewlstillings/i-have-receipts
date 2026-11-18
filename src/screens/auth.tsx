// A · Getting in: A1 splash, A2 sign in, A3 code, A4 welcome, A5 turned off.
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { backend, useStore, errorText } from '../data/store.tsx'
import { AppError } from '../data/types.ts'
import { Art, Av, Btn, Label, Mis, Stroke, TopBar } from '../ui/kit.tsx'
import { firstName } from '../data/logic.ts'
import { useLayout } from '../ui/layout.ts'

const DEMO = backend.mode === 'demo'

export function Splash() {
  const url = window.location.origin
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 0, width: 352, color: { dark: '#2a2a2a', light: '#faf6ee' } }).then(setQr).catch(() => setQr(''))
  }, [url])
  return (
    <div className="app splash">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 520 }}>
        <img className="logo" src="/icon.svg" alt="" width={112} height={112} />
        <span className="mis" style={{ font: '800 64px/68px var(--display)', color: 'var(--ink)' }} data-t="Keeping Receipts">Keeping Receipts</span>
        <p style={{ fontSize: 20, lineHeight: '30px', color: 'var(--ink)' }}>
          Receipts is made for phones and tablets. Scan the code to open it on your phone, or make this window narrower.
        </p>
        <p className="cap">{url.replace(/^https?:\/\//, '')}</p>
      </div>
      <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'var(--cream)', padding: 28, borderRadius: 4, boxShadow: '8px 8px 0 var(--corn)' }}>
        {qr ? <img width={176} height={176} alt={`QR code that opens ${url}`} style={{ mixBlendMode: 'multiply' }} src={qr} /> : <div className="qr" />}
        <figcaption className="label">Open on your phone</figcaption>
      </figure>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  const { tablet } = useLayout()
  return (
    <div className="app">
      <div className="safe" />
      <main className="scroll">
        {tablet
          ? <div style={{ width: '100%', maxWidth: 400, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16, padding: '80px 0 48px' }}>{children}</div>
          : children}
      </main>
      <div className="home-ind" />
    </div>
  )
}

export function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  if (step === 'code') return <Code email={email} onBack={() => setStep('email')} />
  return <EmailStep email={email} setEmail={setEmail} onSent={() => setStep('code')} />
}

function EmailStep({ email, setEmail, onSent }: { email: string; setEmail: (s: string) => void; onSent: () => void }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const v = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErr('Enter a full email, like name@example.com.'); return }
    setErr(''); setBusy(true)
    try { await backend.sendCode(v); setEmail(v); onSent() }
    catch (x) { setErr(x instanceof AppError && x.code === 'offline' ? "Couldn't send. Check your connection and try again." : "Couldn't send a code. Try again in a minute.") }
    finally { setBusy(false) }
  }
  return (
    <Frame>
      <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} noValidate>
        <div style={{ flex: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center' }}>
          <img className="logo" src="/icon.svg" alt="" width={96} height={96} /><span className="wm mis" data-t="Keeping Receipts">Keeping Receipts</span>
          <p style={{ color: 'var(--ink)' }}>People will lie, keep the receipts.</p>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 14, paddingBottom: 16 }}>
          {DEMO && <p className="demo"><b>Demo mode.</b> Fake data, saved only in this browser. Any email and any 6 digits sign you in as Matthew.</p>}
          <label className="fld"><Label>Email</Label>
            <span className={`fbox${err ? ' err' : ''}`}>
              <input type="email" inputMode="email" autoComplete="email" autoCapitalize="off" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!err} aria-describedby={err ? 'email-err' : undefined} />
            </span>
            {err && <span className="ferr" id="email-err"><i />{err}</span>}
          </label>
          <Btn kind="pri" wide type="submit" busy={busy}>Email me a code</Btn>
          <p className="cap" style={{ textAlign: 'center' }}>We'll send a 6-digit code. No password.</p>
        </div>
      </form>
    </Frame>
  )
}

function Code({ email, onBack }: { email: string; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(60)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => {
    if (wait <= 0) return
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(t)
  }, [wait])

  const verify = async (c: string) => {
    setBusy(true); setErr('')
    try { await backend.verifyCode(email, c) }
    catch (x) { setErr(x instanceof AppError && x.code === 'code_expired' ? 'That code expired. Send a new one.' : "That code didn't work. Check it, or send a new one.") }
    finally { setBusy(false) }
  }
  const change = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 6)
    setCode(d); setErr('')
    if (d.length === 6) verify(d)
  }
  const resend = async () => {
    setWait(60); setErr(''); setCode('')
    try { await backend.sendCode(email) } catch { setErr("Couldn't send. Check your connection and try again.") }
    input.current?.focus()
  }
  const boxes = Array.from({ length: 6 }, (_, i) => {
    const v = code[i] ?? ''
    const cls = err ? 'cd err' : v === '' && i === code.length ? 'cd on' : 'cd'
    return <span key={i} className={cls}>{v}</span>
  })
  return (
    <Frame>
      <TopBar left="back" onLeft={onBack} />
      <div className="bigt"><Mis text="Check your email" cls="heading" /></div>
      <p style={{ color: 'var(--ink)' }}>We sent a 6-digit code to <b>{email}</b>. It works for 10 minutes.</p>
      <div className="code" role="group" aria-label="6-digit code" onClick={() => input.current?.focus()}>
        {boxes}
        <input ref={input} value={code} onChange={(e) => change(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
          aria-label="6-digit code" maxLength={6} disabled={busy} aria-invalid={!!err} />
      </div>
      {err ? <>
        <span className="ferr" role="alert"><i />{err}</span>
        <div><Btn kind="sec" sm onClick={resend} disabled={wait > 0}>{wait > 0 ? `Send a new code in 0:${String(wait).padStart(2, '0')}` : 'Send a new code'}</Btn></div>
      </> : wait > 0
        ? <p className="cap">Send a new code in 0:{String(wait).padStart(2, '0')}</p>
        : <div><Btn kind="sec" sm onClick={resend}>Send a new code</Btn></div>}
      {busy && <p className="cap">Checking…</p>}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12, alignItems: 'center' }}>
        <Btn kind="txt" onClick={onBack}>Use a different email</Btn>
        <p className="cap" style={{ textAlign: 'center' }}>No code? Check spam, or ask Matthew to add you.</p>
      </div>
    </Frame>
  )
}

export function Welcome() {
  const { snap, write } = useStore()
  const me = snap!.profiles[snap!.me]
  const [nick, setNick] = useState(me.nickname ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try { await write((w) => w.finish_welcome(nick)) } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  return (
    <Frame>
      <div className="hero" style={{ paddingTop: 12 }}><Av p={me} size={80} /><Mis text={`Welcome, ${firstName(me.display_name)}`} />
        <p className="cap">One quick thing and you're in.</p></div>
      <label className="fld"><Label>Your name</Label><span className="fbox dis">{me.display_name}</span>
        <span className="cap">Wrong? Ask Matthew to change it.</span></label>
      <label className="fld"><Label>Nickname · optional</Label>
        <span className="fbox"><input value={nick} maxLength={20} onChange={(e) => setNick(e.target.value)} placeholder="What friends call you" /></span>
        <span className="cap">Shows next to your name, so two {firstName(me.display_name)}s aren't confused.</span></label>
      {err && <span className="ferr"><i />{err}</span>}
      <div style={{ marginTop: 'auto', paddingBottom: 12 }}><Btn kind="pri" wide busy={busy} onClick={go}>Continue</Btn></div>
    </Frame>
  )
}

export function TurnedOff() {
  const { signOut } = useStore()
  return (
    <Frame>
      <div className="empty" style={{ flex: 1, justifyContent: 'center' }}>
        <Art kind="sun" /><Mis text="Your account was turned off" cls="heading" />
        <p style={{ color: 'var(--ink)' }}>Matthew turned off this account. Your history is kept. Ask him if this is a mistake.</p>
        <Btn kind="sec" onClick={signOut}>Sign out</Btn>
      </div>
    </Frame>
  )
}

export function LoadFailed() {
  const { refresh } = useStore()
  return (
    <Frame>
      <div className="empty" style={{ flex: 1, justifyContent: 'center' }}>
        <span className="sub">This needs a connection the first time</span>
        <p>Check your connection and try again.</p>
        <Btn kind="sec" icon={<Stroke name="refresh" size={16} />} onClick={refresh}>Try again</Btn>
      </div>
    </Frame>
  )
}

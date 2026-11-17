import { useSyncExternalStore } from 'react'

// S-01 / M-02: phone under 600px (or any window under 500px tall), one pane
// with a rail at 600–839px, list + detail at 840–1399px, splash at 1400px+.
export type Mode = 'compact' | 'medium' | 'expanded' | 'splash'

function compute(): Mode {
  const w = window.innerWidth, h = window.innerHeight
  if (w >= 1400) return 'splash'
  if (w < 600 || h < 500) return 'compact'
  if (w < 840) return 'medium'
  return 'expanded'
}

let mode = compute()
const subs = new Set<() => void>()
window.addEventListener('resize', () => {
  const m = compute()
  if (m !== mode) { mode = m; subs.forEach((s) => s()) }
})

export function useLayout(): { mode: Mode; tablet: boolean; expanded: boolean } {
  const m = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => mode)
  return { mode: m, tablet: m === 'medium' || m === 'expanded', expanded: m === 'expanded' }
}

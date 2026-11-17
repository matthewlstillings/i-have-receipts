import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/** Go back if there is somewhere to go back to inside the app, else to `fallback`. */
export function useBack(fallback: string) {
  const nav = useNavigate()
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) nav(-1)
    else nav(fallback, { replace: true })
  }, [nav, fallback])
}

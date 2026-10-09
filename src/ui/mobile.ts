// Phone niceties: swipe between steps, keep the screen on, a tap of vibration on step changes.
import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store'

const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not allowed (e.g. before any user gesture): skip.
  }
}

/**
 * Horizontal swipe on the panel: left = next, right = back. Only quick, clearly sideways
 * swipes count, so vertical scrolling and the scrubber keep working.
 */
export function useSwipeSteps() {
  const start = useRef<{ x: number; y: number; at: number } | null>(null)
  return useMemo(
    () => ({
      onPointerDown(e: React.PointerEvent) {
        const el = e.target as HTMLElement
        // Not from controls: a sideways drag across a checklist row would also tick it.
        start.current = e.pointerType === 'mouse' || el.closest('input, textarea, button, label, a') ? null : { x: e.clientX, y: e.clientY, at: e.timeStamp }
      },
      onPointerUp(e: React.PointerEvent) {
        const s = start.current
        start.current = null
        if (!s) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        const quick = e.timeStamp - s.at < 600
        if (!quick || Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return
        const st = useStore.getState()
        if (dx < 0) {
          // Blocked by the checklist: a double buzz says "not yet".
          if (!st.next('swipe')) buzz([30, 60, 30])
        } else st.back('swipe')
      },
      onPointerCancel() {
        start.current = null
      },
    }),
    [],
  )
}

/** Keeps the screen awake while the guide is open: the phone sits propped up, untouched, for minutes. */
export function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const acquire = async () => {
      if (gone || document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        lock = await navigator.wakeLock.request('screen')
        useStore.getState().record('wake_lock', { on: true })
      } catch {
        // Denied (battery saver, no user gesture yet): try again on the next tap.
      }
    }
    void acquire()
    // Browsers drop the lock when the tab is hidden; take it again on return or on the next tap.
    const onVisible = () => void acquire()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pointerdown', onVisible)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pointerdown', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [])
}

/** A short buzz whenever the step changes, so a glance isn't needed to know it worked. */
export function useStepBuzz() {
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.step !== prev.step) buzz(15)
      }),
    [],
  )
}

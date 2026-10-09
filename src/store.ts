import { create } from 'zustand'
import { DEFAULT_PRODUCT, loadProduct, pickProduct, products } from './data/products'
import { parseAssembly } from './data/schema'

const params = new URLSearchParams(location.search)

// One product per page load, chosen with ?product=<id> (see src/data/products.ts). Generated
// guides are fetched before the app renders; if that fails, fall back to the default product.
const requested = pickProduct(params.get('product'))
const raw = await loadProduct(requested).catch((err) => {
  console.error(err)
  return null
})
export const productId = raw ? requested : DEFAULT_PRODUCT
export const assembly = parseAssembly(raw ?? products[DEFAULT_PRODUCT])

/** Reload with another product, keeping study/participant params. */
export function switchProduct(id: string) {
  const url = new URL(location.href)
  url.searchParams.set('product', id)
  location.assign(url)
}

// ---------- logging (F9) ----------
export interface LogEvent {
  type: string
  at: number // ms since session start
  step: number
  data?: Record<string, unknown>
}

export const study = {
  enabled: params.get('study') === '1',
  cond: params.get('cond') ?? 'app',
}

const sessionStart = Date.now()
const LOG_KEY = 'assembly-log'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: keep going in memory */
  }
}

// ---------- calibration (F3) ----------
const CAL_KEY = 'px-per-mm'
const storedCal = Number(safeGet(CAL_KEY))

interface State {
  step: number
  t: number
  playing: boolean
  exploded: boolean
  replayNonce: number
  checked: Record<number, boolean[]>
  pxPerMm: number | null
  participant: string
  log: LogEvent[]
  setT: (t: number, source?: 'scrub') => void
  tick: (dt: number) => void
  goTo: (step: number, how: string) => void
  next: (how: string) => boolean
  back: (how: string) => void
  replay: (how: string) => void
  togglePlay: () => void
  toggleExplode: (how: string) => void
  toggleCheck: (i: number) => void
  checkAll: (how: string) => void
  canAdvance: () => boolean
  calibrate: (pxPerMm: number) => void
  setParticipant: (id: string) => void
  record: (type: string, data?: Record<string, unknown>) => void
}

export const useStore = create<State>((set, get) => ({
  step: 0,
  t: 0,
  playing: true,
  exploded: false,
  replayNonce: 0,
  checked: {},
  pxPerMm: storedCal > 0 ? storedCal : null,
  participant: params.get('pid') ?? '',
  log: [],

  record(type, data) {
    const ev: LogEvent = { type, at: Date.now() - sessionStart, step: get().step, data }
    set((s) => ({ log: [...s.log, ev] }))
    if (study.enabled) safeSet(LOG_KEY, JSON.stringify(get().log))
  },

  setT(t, source) {
    set({ t: Math.min(1, Math.max(0, t)), playing: false })
    if (source) get().record('scrub', { t: Math.round(t * 100) / 100 })
  },

  tick(dt) {
    const { playing, t, step } = get()
    if (!playing) return
    const next = t + dt / assembly.steps[step].durationSec
    if (next >= 1) set({ t: 1, playing: false })
    else set({ t: next })
  },

  goTo(step, how) {
    const s = Math.min(Math.max(0, step), assembly.steps.length - 1)
    if (s === get().step) return
    set({ step: s, t: 0, playing: true, exploded: false })
    get().record('step_enter', { id: assembly.steps[s].id, how })
  },

  canAdvance() {
    const { step, checked } = get()
    const items = assembly.steps[step].checklist
    return items.every((_, i) => checked[step]?.[i])
  },

  next(how) {
    const { step } = get()
    if (step >= assembly.steps.length - 1) {
      get().record('finish', { how })
      return false
    }
    if (!get().canAdvance()) {
      get().record('next_blocked', { how })
      return false
    }
    get().goTo(step + 1, how)
    return true
  },

  back(how) {
    get().goTo(get().step - 1, how)
  },

  replay(how) {
    set((s) => ({ t: 0, playing: true, replayNonce: s.replayNonce + 1 }))
    get().record('replay', { how })
  },

  togglePlay() {
    const { playing, t } = get()
    set({ playing: !playing, t: !playing && t >= 1 ? 0 : t })
  },

  toggleExplode(how) {
    const exploded = !get().exploded
    set({ exploded })
    get().record('explode', { on: exploded, how })
  },

  toggleCheck(i) {
    const { step, checked } = get()
    const row = [...(checked[step] ?? [])]
    row[i] = !row[i]
    set({ checked: { ...checked, [step]: row } })
    get().record('check', { item: i, on: row[i] })
  },

  checkAll(how) {
    const { step, checked } = get()
    set({ checked: { ...checked, [step]: assembly.steps[step].checklist.map(() => true) } })
    get().record('check_all', { how })
  },

  calibrate(pxPerMm) {
    safeSet(CAL_KEY, String(pxPerMm))
    set({ pxPerMm })
    get().record('calibrate', { pxPerMm })
  },

  setParticipant(participant) {
    set({ participant })
  },
}))

export function exportLog() {
  const { log, participant } = useStore.getState()
  const body = {
    participant,
    condition: study.cond,
    product: assembly.product.id,
    startedAt: new Date(sessionStart).toISOString(),
    exportedAt: new Date().toISOString(),
    events: log,
    // Real-world step times to compare against (see assembly.sources).
    baseline: Object.fromEntries(assembly.steps.filter((s) => s.typical).map((s) => [s.id, s.typical])),
    sources: assembly.sources,
  }
  const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `study-${participant || 'anon'}-${study.cond}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

// First step counts as entered.
useStore.getState().record('step_enter', { id: assembly.steps[0].id, how: 'start' })

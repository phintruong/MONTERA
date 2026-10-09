import { useRef, useState } from 'react'
import { assembly, useStore } from '../store'
import { TrueSize } from './TrueSize'
import { pill } from './styles'
import type { Answer } from '../ask/ask'
import { IconBack, IconCheck, IconPause, IconPlay, IconReplay, IconWarning } from './icons'

const circle =
  'inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-hairline text-ink transition-colors duration-150 hover:bg-hover disabled:text-hairline disabled:hover:bg-transparent'
const heading = 'text-base font-bold text-ink'

// "~4 s", "~1½ min"
function shortTime(sec: number) {
  if (sec < 60) return `~${Math.round(sec)} s`
  const halves = Math.round(sec / 30)
  return `~${Math.floor(halves / 2)}${halves % 2 ? '½' : ''} min`
}

export function StepHeader({ compact }: { compact: boolean }) {
  const step = useStore((s) => s.step)
  const s = assembly.steps[step]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-4">
        <span className="text-[64px] leading-[0.8] font-bold tracking-[-0.05em] tabular-nums md:text-[104px]" aria-hidden>
          {step + 1}
        </span>
        <div className="min-w-0 pb-0.5">
          <p className="text-base text-ink-soft">
            Step {step + 1} of {assembly.steps.length}
            {s.typical && <> · most people {shortTime(s.typical.medianSec)}</>}
          </p>
          <h1 className="text-xl leading-tight font-bold tracking-[-0.01em] md:text-2xl">{s.title}</h1>
        </div>
      </div>
      <p className={`max-w-[60ch] text-base leading-relaxed md:text-lg ${compact ? 'line-clamp-2' : ''}`}>{s.instruction}</p>
      {s.warning && (
        <div className="flex items-start gap-3 rounded-lg bg-yellow px-4 py-3" role="alert">
          <span className="mt-0.5 shrink-0">
            <IconWarning />
          </span>
          <p className="text-base leading-snug font-bold">{s.warning}</p>
        </div>
      )}
      {assembly.product.note && <p className="border-t border-hairline pt-3 text-base text-ink-soft">{assembly.product.note}</p>}
    </div>
  )
}

export function Controls() {
  const step = useStore((s) => s.step)
  const t = useStore((s) => s.t)
  const playing = useStore((s) => s.playing)
  const checked = useStore((s) => s.checked[s.step])
  const { back, replay, togglePlay, setT, next, goTo, record } = useStore.getState()
  const items = assembly.steps[step].checklist
  const done = items.filter((_, i) => checked?.[i]).length
  const canAdvance = done === items.length
  const last = step === assembly.steps.length - 1
  // The hint stays until the list is done (or the step changes), so a glance can still catch it.
  const [nudgedStep, setNudgedStep] = useState<number | null>(null)
  const nudge = nudgedStep === step && !canAdvance
  const pressTimer = useRef<number | undefined>(undefined)
  const skipped = useRef(false)

  // F5: tap is gated by the checklist; holding for 0.8 s skips (and is logged).
  const onDown = () => {
    skipped.current = false
    if (canAdvance || last) return
    pressTimer.current = window.setTimeout(() => {
      skipped.current = true
      record('skip_checklist', { step })
      goTo(step + 1, 'long_press')
    }, 800)
  }
  const onUp = () => window.clearTimeout(pressTimer.current)
  const onClick = () => {
    if (skipped.current) return
    if (!next('button') && !last) setNudgedStep(step)
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(t * 1000)}
        onChange={(e) => setT(Number(e.target.value) / 1000, 'scrub')}
        className="h-5 w-full"
        aria-label="Scrub animation"
      />
      <div className="flex items-center gap-2">
        <button className={circle} onClick={() => back('button')} disabled={step === 0} aria-label="Previous step">
          <IconBack />
        </button>
        <button className={circle} onClick={() => replay('button')} aria-label="Replay step">
          <IconReplay />
        </button>
        <button className={circle} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button
          className={`${pill} flex-1 select-none ${
            canAdvance || last ? 'bg-blue text-white hover:bg-blue-hover' : 'border border-hairline bg-hover text-ink-soft'
          }`}
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onClick={onClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="whitespace-nowrap">{last ? 'Finish' : 'Next'}</span>
          {!last && !canAdvance && (
            <span className="rounded-full bg-canvas px-2 py-0.5 text-base tabular-nums" aria-label={`${done} of ${items.length} checked`}>
              {done}/{items.length}
            </span>
          )}
        </button>
      </div>
      {nudge && (
        <p className="text-base font-bold" role="status">
          Tick the list below, or say “done”. Hold Next to skip.
        </p>
      )}
    </div>
  )
}

export function Tray({ onCalibrate }: { onCalibrate: () => void }) {
  const step = useStore((s) => s.step)
  const calibrated = useStore((s) => s.pxPerMm !== null)
  const tray = assembly.steps[step].tray
  if (tray.length === 0) return null
  return (
    <section>
      <h2 className={heading}>You need</h2>
      <ul className="mt-2 border-t border-hairline">
        {tray.map(({ part: id, count }) => {
          const part = assembly.parts[id]
          return (
            <li key={id} className="border-b border-hairline py-3">
              <div className="flex items-baseline gap-3">
                <span className="w-12 text-2xl font-bold tracking-[-0.02em] tabular-nums">{count}×</span>
                <span className="text-base">{part.name}</span>
              </div>
              {part.hardware && (
                <div className="mt-3 ml-15 flex flex-col items-start gap-2 overflow-x-auto">
                  <TrueSize part={part} />
                  <button className="text-sm font-bold underline underline-offset-4" onClick={onCalibrate}>
                    {calibrated ? 'Recalibrate actual size' : 'Show at actual size'}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function Checklist() {
  const step = useStore((s) => s.step)
  const checked = useStore((s) => s.checked[s.step])
  const toggle = useStore((s) => s.toggleCheck)
  const items = assembly.steps[step].checklist
  if (items.length === 0) return null
  return (
    <section>
      <h2 className={heading}>Before you continue</h2>
      <ul className="mt-2 border-t border-hairline">
        {items.map((label, i) => {
          const on = !!checked?.[i]
          return (
            <li key={i} className="border-b border-hairline">
              <label className="flex min-h-14 cursor-pointer items-center gap-4 py-3">
                <input type="checkbox" className="peer sr-only" checked={on} onChange={() => toggle(i)} />
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2 ${
                    on ? 'border-blue bg-blue text-white' : 'border-ink'
                  }`}
                >
                  {on && <IconCheck />}
                </span>
                <span className="text-base">{label}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function AskBox({
  onAsk,
  pending,
  answer,
}: {
  onAsk: (q: string, how: 'text' | 'voice') => void
  pending: boolean
  answer: (Answer & { question: string }) | null
}) {
  const [q, setQ] = useState('')
  const record = useStore((s) => s.record)
  const [rated, setRated] = useState<string | null>(null)
  return (
    <section>
      <h2 className={heading}>Stuck?</h2>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!q.trim()) return
          onAsk(q.trim(), 'text')
          setQ('')
          setRated(null)
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Which screw goes here?"
          className="h-14 min-w-0 flex-1 rounded-full border border-ink-soft bg-canvas px-5 text-base placeholder:text-ink-soft focus-visible:border-ink"
          aria-label="Ask a question about this step"
        />
        <button className={`${pill} bg-ink text-white hover:bg-ink-hover`} disabled={pending}>
          {pending ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {answer && (
        <div className="mt-3 rounded-lg bg-hover p-4" aria-live="polite">
          <p className="text-sm text-ink-soft">“{answer.question}”</p>
          <p className="mt-1 text-lg leading-snug">{answer.text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-sm text-ink-soft">
              {answer.source === 'llm' ? 'AI answer' : answer.source === 'faq' ? 'From this step’s notes' : 'No answer found'}
            </span>
            {(['up', 'down'] as const).map((r) => (
              <button
                key={r}
                className={`h-14 rounded-full border px-5 text-base font-bold transition-colors duration-150 ${
                  rated === r ? 'border-ink bg-ink text-white' : 'border-hairline hover:bg-canvas'
                }`}
                onClick={() => {
                  setRated(r)
                  record('answer_rating', { rating: r, question: answer.question, source: answer.source })
                }}
              >
                {r === 'up' ? 'Helpful' : 'Not helpful'}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

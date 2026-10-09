import { useEffect, useState } from 'react'
import { assembly, exportLog, useStore } from '../store'
import { IconBack } from './icons'
import { useWakeLock } from './mobile'
import { pill } from './styles'

/**
 * Paper-manual condition (?study=1&cond=paper&pid=P01&product=lack): no 3D guide. The experimenter
 * holds this screen and taps as the participant works from the paper manual. Events use the same
 * log format as the app condition (step_enter, finish, plus observations), so
 * scripts/analyze-study.mjs compares both.
 */
export function PaperStudy() {
  const step = useStore((s) => s.step)
  const participant = useStore((s) => s.participant)
  const log = useStore((s) => s.log)
  const { goTo, record, setParticipant } = useStore.getState()
  useWakeLock()
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const s = assembly.steps[step]
  const last = step === assembly.steps.length - 1
  const finished = log.some((e) => e.type === 'finish')
  const count = (type: string) => log.filter((e) => e.type === type && e.step === step).length
  const sec = Math.floor((now - start) / 1000)

  const observe = (type: 'stuck' | 'error' | 'help', label: string) => (
    <button className={`${pill} flex-1 border border-ink bg-canvas hover:bg-hover`} onClick={() => record(type, { how: 'experimenter' })}>
      {label}
      {count(type) > 0 && <span className="rounded-full bg-ink px-2 text-base text-white tabular-nums">{count(type)}</span>}
    </button>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 bg-canvas px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-lg font-bold">
          Paper manual · {assembly.product.name}
        </p>
        <input
          value={participant}
          onChange={(e) => setParticipant(e.target.value)}
          placeholder="Participant"
          aria-label="Participant ID"
          className="h-14 w-36 rounded-full border border-hairline px-5 text-base"
        />
        <span className="text-2xl font-bold tabular-nums" aria-label="Elapsed time">
          {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
        </span>
      </header>

      <section className="flex items-end gap-4">
        <span className="text-[104px] leading-[0.8] font-bold tracking-[-0.05em] tabular-nums">{step + 1}</span>
        <div className="pb-1">
          <p className="text-base text-ink-soft">
            Step {step + 1} of {assembly.steps.length}
            {s.typical && <> · most people ~{Math.round(s.typical.medianSec)} s</>}
          </p>
          <h1 className="text-2xl leading-tight font-bold">{s.title}</h1>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">Note what you see</h2>
        <div className="flex gap-2">
          {observe('stuck', 'Stuck')}
          {observe('error', 'Mistake')}
          {observe('help', 'Asked')}
        </div>
      </section>

      <div className="mt-auto flex gap-2">
        <button
          className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-hairline transition-colors duration-150 hover:bg-hover disabled:text-hairline"
          onClick={() => goTo(step - 1, 'experimenter')}
          disabled={step === 0 || finished}
          aria-label="Previous step"
        >
          <IconBack />
        </button>
        {finished ? (
          <button className={`${pill} flex-1 bg-ink text-white hover:bg-ink-hover`} onClick={exportLog}>
            Export log
          </button>
        ) : (
          <button
            className={`${pill} flex-1 bg-blue text-white hover:bg-blue-hover`}
            onClick={() => (last ? record('finish', { how: 'experimenter' }) : goTo(step + 1, 'experimenter'))}
          >
            {last ? 'Finished building' : `Step ${step + 1} done`}
          </button>
        )}
      </div>
    </main>
  )
}

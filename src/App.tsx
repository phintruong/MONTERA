import { Fragment, useCallback, useEffect, useState } from 'react'
import { Scene } from './scene/Scene'
import { view } from './scene/view'
import { assembly, exportLog, loadFailed, productId, study, switchProduct, useStore } from './store'
import { generated, productIds, productNames, type CatalogEntry } from './data/products'
import { AskBox, Checklist, Controls, StepHeader, Tray } from './ui/Panel'
import { Calibrate } from './ui/TrueSize'
import { IconExplode, IconMic, IconRecenter } from './ui/icons'
import { ask, speak, type Answer } from './ask/ask'
import { useVoice } from './voice/useVoice'
import { useStepBuzz, useSwipeSteps, useWakeLock } from './ui/mobile'
import { PaperStudy } from './ui/PaperStudy'
import type { Command } from './voice/commands'

const toggle =
  'inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full border px-4 text-base font-bold transition-colors duration-150 roomy:px-5'

// The paper-manual study condition gets its own experimenter screen and never loads the 3D guide.
export default function Root() {
  return study.enabled && study.cond === 'paper' ? <PaperStudy /> : <App />
}

function App() {
  const step = useStore((s) => s.step)
  const exploded = useStore((s) => s.exploded)
  const [calibrating, setCalibrating] = useState(false)
  const [showLoadFailed, setShowLoadFailed] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [pending, setPending] = useState(false)
  const [answer, setAnswer] = useState<(Answer & { question: string; step: number }) | null>(null)

  const runAsk = useCallback(async (question: string, how: 'text' | 'voice') => {
    const st = useStore.getState()
    setPending(true)
    const a = await ask(st.step, question)
    setPending(false)
    setAnswer({ ...a, question, step: st.step })
    setSheetOpen(true)
    st.record('question', { question, how, source: a.source, answer: a.text })
    speak(a.text)
  }, [])

  const onCommand = useCallback(
    (cmd: Command, heard: string) => {
      const st = useStore.getState()
      st.record('voice', { heard, command: cmd.type })
      switch (cmd.type) {
        case 'next':
          if (!st.next('voice')) {
            const last = st.step === assembly.steps.length - 1
            speak(last ? 'That was the last step. Nice work.' : 'Tick the checklist first, or say done.')
          }
          break
        case 'back':
          st.back('voice')
          break
        case 'replay':
          st.replay('voice')
          break
        case 'done':
          st.checkAll('voice')
          speak('Checked. Say next when ready.')
          break
        case 'explode':
          st.toggleExplode('voice')
          break
        case 'pause':
          if (st.playing) st.togglePlay()
          break
        case 'ask':
          void runAsk(cmd.text, 'voice')
          break
        case 'unknown':
          st.record('voice_miss', { heard })
          break
      }
    },
    [runAsk],
  )
  const voice = useVoice(onCommand)
  const swipe = useSwipeSteps()
  useWakeLock()
  useStepBuzz()

  // Keyboard: arrows, space, R, E.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'checkbox') return
      const st = useStore.getState()
      if (e.key === 'ArrowRight') st.next('key')
      else if (e.key === 'ArrowLeft') st.back('key')
      else if (e.key === ' ') {
        e.preventDefault()
        st.togglePlay()
      } else if (e.key === 'r' || e.key === 'R') st.replay('key')
      else if (e.key === 'e' || e.key === 'E') st.toggleExplode('key')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])


  return (
    // Safe-area padding keeps controls clear of notches and rounded corners (viewport-fit=cover).
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-canvas pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] side:flex-row">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Phones: a solid bar above the 3D view, so nothing covers the model. Side by side: floats over it. */}
        <header className="relative z-10 flex shrink-0 items-start gap-2 border-b border-hairline bg-canvas px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 side:pointer-events-none side:absolute side:inset-x-0 side:top-0 side:justify-between side:gap-3 side:border-0 side:bg-transparent side:p-6 short:side:p-3">
          <div className="pointer-events-auto min-w-0 flex-1 side:flex-none">
            {/* Study sessions are pinned to one product: a stray switch would reload and lose the log. */}
            {study.enabled ? (
              <p className="flex h-14 items-center truncate text-lg font-bold tracking-[-0.01em]">{assembly.product.name}</p>
            ) : (
              <ProductPicker />
            )}
            {/* Phones show "Step 1 of 4" in the panel instead. */}
            <ol className="mt-3 hidden gap-1 pl-1 side:flex short:hidden" aria-label={`Step ${step + 1} of ${assembly.steps.length}`}>
              {assembly.steps.map((st, i) => (
                <li
                  key={st.id}
                  className={`h-2 rounded-full transition-colors duration-300 ${assembly.steps.length > 6 ? 'w-4 roomy:w-6' : 'w-8'} ${i === step ? 'bg-yellow' : i < step ? 'bg-ink' : 'bg-hairline'}`}
                />
              ))}
            </ol>
          </div>
          <div className="pointer-events-auto flex shrink-0 justify-end gap-2">
            {voice.supported && (
              <button
                className={`${toggle} ${voice.listening ? 'border-ink bg-ink text-white' : 'border-hairline bg-canvas hover:bg-hover'}`}
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                aria-pressed={voice.listening}
                aria-label={voice.listening ? 'Stop listening' : 'Voice control'}
              >
                <IconMic />
                <span className="hidden roomy:inline" aria-hidden>
                  {voice.listening ? 'Listening' : 'Voice'}
                </span>
                {voice.listening && <span className="h-2 w-2 animate-pulse rounded-full bg-yellow" aria-hidden />}
              </button>
            )}
            <button
              className={`${toggle} ${exploded ? 'border-ink bg-ink text-white' : 'border-hairline bg-canvas hover:bg-hover'}`}
              onClick={() => useStore.getState().toggleExplode('button')}
              aria-pressed={exploded}
              aria-label="Spread out the parts"
            >
              <IconExplode />
              <span className="hidden roomy:inline" aria-hidden>
                Spread out
              </span>
            </button>
          </div>
        </header>

        {/* 3D viewport */}
        <div className="relative min-h-0 flex-1">
          <Scene />

          {loadFailed && showLoadFailed && (
            <p
              className="absolute inset-x-3 top-3 z-10 flex items-start gap-3 rounded-lg border border-ink bg-canvas py-2 pr-2 pl-4 text-base side:top-auto side:right-auto side:bottom-24 side:left-6 side:max-w-[22rem]"
              role="alert"
            >
              <span className="py-1">
                Couldn’t open “{loadFailed}”. Showing the {assembly.product.name} instead.
              </span>
              <button
                className="h-10 shrink-0 rounded-full px-3 font-bold transition-colors duration-150 hover:bg-hover"
                onClick={() => setShowLoadFailed(false)}
              >
                OK
              </button>
            </p>
          )}

          {!(voice.listening && voice.heard) && <ViewHint />}

          {voice.listening && voice.heard && (
            <p className="absolute bottom-3 left-3 max-w-[80%] rounded-full bg-ink px-5 py-3 text-base text-white side:bottom-6 side:left-6">
              “{voice.heard}”
            </p>
          )}

          {study.enabled && <StudyBar />}
        </div>
      </div>

      {/* Panel: bottom sheet on phones, sidebar when side by side. Step controls stay pinned at its foot. */}
      <aside
        className={`flex min-h-0 shrink-0 flex-col border-t border-hairline bg-canvas side:h-full side:max-h-none side:w-[440px] side:border-t-0 side:border-l short:side:w-[min(400px,50vw)] ${
          sheetOpen ? 'max-h-[54dvh]' : 'max-h-[34dvh]'
        }`}
      >
        <button
          className="flex h-8 w-full shrink-0 items-center justify-center side:hidden"
          onClick={() => setSheetOpen((o) => !o)}
          aria-label={sheetOpen ? 'Show less' : 'Show more'}
          aria-expanded={sheetOpen}
        >
          <span className="h-1.5 w-12 rounded-full bg-hairline" />
        </button>
        {/* pan-y: the browser scrolls vertically and leaves sideways drags to the swipe handler. */}
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain" {...swipe}>
          <div className="flex flex-col gap-5 px-4 pb-5 side:px-8 side:pt-8 short:side:px-5 short:side:pt-4">
            <StepHeader compact={!sheetOpen} />
          </div>
          <div className={`flex flex-col gap-8 px-4 pt-1 pb-8 side:flex side:px-8 short:side:px-5 ${sheetOpen ? '' : 'hidden'}`}>
            <Tray onCalibrate={() => setCalibrating(true)} />
            <Checklist />
            <AskBox onAsk={runAsk} pending={pending} answer={answer?.step === step ? answer : null} />
            <p className="text-base leading-relaxed text-ink-soft">
              Hands full? Turn on Voice and say “next”, “back”, “again”, “done” or ask a question.
              <span className="hidden pointer-fine:inline"> Keys: ← → space R E.</span>
              <span className="pointer-fine:hidden"> Or swipe this panel left and right to change step.</span>
            </p>
          </div>
        </div>
        <div className="shrink-0 border-t border-hairline bg-canvas px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] side:px-8 side:pb-6 short:side:px-5 short:side:pt-2 short:side:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Controls />
        </div>
      </aside>

      {calibrating && <Calibrate onClose={() => setCalibrating(false)} />}
    </div>
  )
}

// Every product the picker can switch to: full guides, then simplified, then parts-only, by category.
interface PickerEntry {
  id: string
  name: string
  group: string
  key: string // lower-case, accents stripped: "poang" finds POÄNG
  partsOnly: boolean
}
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const GROUP_NOTE: Record<CatalogEntry['from'], string> = {
  flatpack: 'simplified',
  'ikea-manual': 'parts only',
}
const ENTRIES: PickerEntry[] = [
  ...productIds.map((id) => ({ id, name: productNames[id], group: 'Full guides', partsOnly: false })),
  ...(['flatpack', 'ikea-manual'] as const).flatMap((from) =>
    generated
      .filter((c) => c.from === from)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, group: `${c.category} · ${GROUP_NOTE[from]}`, partsOnly: from === 'ikea-manual' })),
  ),
].map((e) => ({ ...e, key: fold(`${e.name} ${e.group} ${e.id}`) }))
const PARTS_ONLY = ENTRIES.filter((e) => e.partsOnly).length
const SUGGEST = ['LACK', 'KALLAX', 'BILLY']

/** The product name doubles as the product switch: type to search. Switching reloads with ?product=. */
function ProductPicker() {
  const step = useStore((s) => s.step)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  // Switching reloads and drops progress, so mid-build the first pick only asks.
  const [confirmId, setConfirmId] = useState<string | null>(null)
  // Parts-only guides are thinner, so browsing hides them until asked; typing searches everything.
  const [showAll, setShowAll] = useState(productId.startsWith('im-'))
  const words = fold(query).split(/\s+/).filter(Boolean)
  const results = ENTRIES.filter((e) => (words.length > 0 || showAll || !e.partsOnly) && words.every((w) => e.key.includes(w)))
  const hidden = words.length === 0 && !showAll
  const current = ENTRIES.find((e) => e.id === productId)

  const search = (q: string) => {
    setQuery(q)
    setHi(0)
    setConfirmId(null)
  }
  const choose = (id: string) => {
    if (id === productId) return setOpen(false)
    if (step > 0 && confirmId !== id) return setConfirmId(id)
    setOpen(false)
    useStore.getState().record('product_switch', { to: id, query, fromStep: step })
    switchProduct(id)
  }

  return (
    <div className="relative w-full side:w-[min(22rem,40vw)] short:side:w-[min(16rem,30vw)]">
      <label className="relative flex items-center">
        <span className="sr-only">Search products</span>
        <svg className="pointer-events-none absolute left-4 h-4 w-4 text-ink" viewBox="0 0 16 16" aria-hidden>
          <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls="product-results"
          aria-activedescendant={open && results[hi] ? `product-${results[hi].id}` : undefined}
          value={open ? query : (current?.name ?? '')}
          placeholder="Search, e.g. kallax"
          // Phone keyboards: a "search" key, and no autocorrect turning "kallax" into "Kallas".
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onFocus={(e) => {
            setOpen(true)
            search('')
            e.currentTarget.select()
          }}
          onBlur={() => setOpen(false)}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => Math.min(h + 1, results.length - 1))
              setConfirmId(null)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(h - 1, 0))
              setConfirmId(null)
            } else if (e.key === 'Enter' && results[hi]) {
              choose(results[hi].id)
            } else if (e.key === 'Escape') {
              e.currentTarget.blur()
            }
          }}
          className={`h-14 w-full truncate rounded-full border bg-canvas pr-4 pl-11 text-base text-ink transition-colors duration-150 placeholder:text-ink-soft hover:border-ink ${
            open ? 'border-ink font-normal' : 'border-hairline font-bold'
          }`}
        />
      </label>
      {open && (
        <ul
          id="product-results"
          role="listbox"
          aria-label="Products"
          // Phones: full width under the header, short enough to stay above the on-screen keyboard.
          className="absolute z-20 mt-2 max-h-[45dvh] w-[calc(100vw-1.5rem-env(safe-area-inset-left)-env(safe-area-inset-right))] overflow-y-auto overscroll-contain rounded-lg border border-ink bg-canvas side:max-h-[60dvh] side:w-full"
          // Keep focus in the input so clicking a result doesn't close the list first.
          onMouseDown={(e) => e.preventDefault()}
        >
          {results.length === 0 && (
            <li className="flex flex-col gap-3 px-4 py-4" role="presentation">
              <span className="text-base">No guide for “{query}” yet. Try:</span>
              <span className="flex flex-wrap gap-2">
                {SUGGEST.map((s) => (
                  <button
                    key={s}
                    className="h-11 rounded-full border border-hairline px-4 text-base font-bold transition-colors duration-150 hover:bg-hover"
                    onClick={() => search(s.toLowerCase())}
                  >
                    {s}
                  </button>
                ))}
              </span>
            </li>
          )}
          {results.map((e, i) => {
            const asking = confirmId === e.id
            return (
              <Fragment key={e.id}>
                {e.group !== results[i - 1]?.group && (
                  <li
                    role="presentation"
                    className="sticky top-0 border-b border-hairline bg-canvas px-4 pt-3 pb-1.5 text-sm font-bold text-ink-soft"
                  >
                    {e.group}
                  </li>
                )}
                <li
                  id={`product-${e.id}`}
                  role="option"
                  aria-selected={i === hi}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => choose(e.id)}
                  className={`flex min-h-12 cursor-pointer flex-col justify-center px-4 py-2 ${
                    asking ? 'bg-yellow' : i === hi ? 'bg-hover' : ''
                  }`}
                >
                  <span className={`text-base ${e.id === productId || asking ? 'font-bold' : ''}`}>
                    {e.name}
                    {e.id === productId && <span className="font-normal text-ink-soft"> · open now</span>}
                  </span>
                  {asking && (
                    <span className="text-base">Leave step {step + 1} of {current?.name}? Choose it again to switch.</span>
                  )}
                </li>
              </Fragment>
            )
          })}
          {hidden && (
            <li role="presentation" className="border-t border-hairline">
              <button
                className="flex min-h-14 w-full flex-col justify-center px-4 py-2 text-left transition-colors duration-150 hover:bg-hover"
                onClick={() => setShowAll(true)}
              >
                <span className="text-base font-bold">Show {PARTS_ONLY} more</span>
                <span className="text-sm text-ink-soft">Parts only: you follow the paper manual for fittings</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/** Over the 3D view: put the camera back where the step wants it, and how to move it. */
const TOUCH_HINT_KEY = 'ikea3d.touchHintSeen'
function ViewHint() {
  // Phones get a gesture hint until the first touch on the 3D view (remembered per browser).
  const [touchSeen, setTouchSeen] = useState(() => {
    try {
      return localStorage.getItem(TOUCH_HINT_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (touchSeen) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return
      setTouchSeen(true)
      try {
        localStorage.setItem(TOUCH_HINT_KEY, '1')
      } catch {
        // Private mode: the hint just comes back next visit.
      }
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [touchSeen])

  return (
    <>
      {/* Phones: an icon button in the free top-right corner of the 3D view. Side by side: labelled, bottom-left. */}
      <button
        className="absolute top-3 right-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-canvas transition-colors duration-150 hover:bg-hover side:top-auto side:right-auto side:bottom-6 side:left-6 side:h-14 side:w-auto side:gap-2 side:px-5 side:text-base side:font-bold short:side:bottom-3 short:side:left-3"
        onClick={() => view.reset()}
        aria-label="Reset view"
      >
        <IconRecenter />
        <span className="hidden side:inline">Reset view</span>
      </button>
      <p className="pointer-events-none absolute bottom-6 left-48 hidden max-w-[48ch] text-sm text-ink-soft pointer-fine:side:block">
        Drag to turn, right-drag to move, scroll to zoom. Double-click a part to turn around it.
      </p>
      {!touchSeen && (
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-ink px-4 py-2 text-base whitespace-nowrap text-white pointer-fine:hidden side:bottom-6 side:left-48 short:side:bottom-3 short:side:left-44">
          Drag to turn · pinch to zoom
        </p>
      )}
    </>
  )
}

function StudyBar() {
  const participant = useStore((s) => s.participant)
  const setParticipant = useStore((s) => s.setParticipant)
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const sec = Math.floor((now - start) / 1000)
  return (
    <div className="absolute right-3 bottom-3 flex items-center gap-2 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-sm text-white side:right-6 side:bottom-6">
      <input
        value={participant}
        onChange={(e) => setParticipant(e.target.value)}
        placeholder="Participant"
        className="h-9 w-28 bg-transparent placeholder:text-white/60"
        aria-label="Participant ID"
      />
      <span className="tabular-nums">
        {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
      </span>
      <span className="text-white/60">{study.cond}</span>
      <button className="h-9 rounded-full bg-canvas px-4 font-bold text-ink" onClick={exportLog}>
        Export
      </button>
    </div>
  )
}

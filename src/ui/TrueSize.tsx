import { useState } from 'react'
import type { Part } from '../data/schema'
import { useStore } from '../store'
import { pill } from './styles'

// ISO/IEC 7810 ID-1 bank card. Calibrate on the short edge so it fits on a phone held upright.
const CARD_SHORT_MM = 53.98
const CARD_LONG_MM = 85.6

/** Hardware silhouette drawn at real size once calibrated (F3). */
export function TrueSize({ part }: { part: Part }) {
  const pxPerMm = useStore((s) => s.pxPerMm)
  const scale = pxPerMm ?? 3 // uncalibrated: a sensible guess, labelled as such
  const [d, len] = part.size
  const w = len * scale
  const h = Math.max(d * scale, 6)
  const rings = 7
  return (
    <figure className="flex flex-col items-start gap-1">
      <svg width={w + 2} height={h + 6} viewBox={`-1 -3 ${w + 2} ${h + 6}`} aria-label={`${part.name}, ${len} mm`}>
        <rect x={0} y={0} width={w} height={h} rx={h * 0.2} fill="#e4e4e4" stroke="#111111" strokeWidth={1.5} />
        {Array.from({ length: rings * 2 }, (_, i) => {
          // threads on each end, plain shoulder in the middle
          const k = i % rings
          const x = i < rings ? ((k + 0.5) * (w * 0.42)) / rings : w * 0.58 + ((k + 0.5) * (w * 0.42)) / rings
          return <line key={i} x1={x - h * 0.25} y1={-2} x2={x + h * 0.25} y2={h + 2} stroke="#111111" strokeWidth={1} />
        })}
      </svg>
      <figcaption className="text-sm text-ink-soft">
        {len} mm{pxPerMm ? ', actual size. Hold the screw against the screen.' : ', not to scale yet'}
      </figcaption>
    </figure>
  )
}

export function Calibrate({ onClose }: { onClose: () => void }) {
  const current = useStore((s) => s.pxPerMm)
  const calibrate = useStore((s) => s.calibrate)
  const [px, setPx] = useState(Math.round((current ?? 3.8) * CARD_SHORT_MM))
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-labelledby="cal-title">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto p-6">
        <h2 id="cal-title" className="text-2xl font-bold tracking-[-0.01em]">
          Match a bank card
        </h2>
        <p className="text-base leading-relaxed">
          Hold any bank card upright against the screen. Drag the slider until the yellow box is exactly as wide as the card.
        </p>
        <div className="flex max-h-[55vh] flex-1 justify-center overflow-hidden py-2">
          <div
            className="shrink-0 rounded-lg border-2 border-ink bg-yellow"
            style={{ width: px, height: px * (CARD_LONG_MM / CARD_SHORT_MM) }}
          />
        </div>
        <input
          type="range"
          min={120}
          max={500}
          value={px}
          onChange={(e) => setPx(Number(e.target.value))}
          className="h-14 w-full"
          aria-label="Card width on screen"
        />
        <div className="flex gap-3 pb-2">
          <button className={`${pill} flex-1 border border-ink hover:bg-hover`} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${pill} flex-1 bg-blue text-white hover:bg-blue-hover`}
            onClick={() => {
              calibrate(px / CARD_SHORT_MM)
              onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

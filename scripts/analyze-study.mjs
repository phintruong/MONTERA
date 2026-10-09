// Summarises exported study logs (the JSON files from the Export button, app or paper condition).
//
//   node scripts/analyze-study.mjs study-logs/            # a folder of exports
//   node scripts/analyze-study.mjs a.json b.json --out results
//
// Writes <out>/sessions.csv (one row per session) and <out>/steps.csv (one row per session × step,
// with the real-world baseline where there is one), and prints medians per condition.
// Time in a step runs from entering it to entering the next one (or finishing); going back and
// forth adds up per step.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const args = process.argv.slice(2)
const outAt = args.indexOf('--out')
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : 'study-results'
if (args.length === 0) {
  console.error('usage: node scripts/analyze-study.mjs <export.json | folder>... [--out dir]')
  process.exit(1)
}
const files = args.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(p, f))
    : [p],
)

// Events worth counting, by name in the CSV.
const COUNTS = {
  blocked: 'next_blocked', // tried Next before ticking the checklist
  skipped: 'skip_checklist',
  replays: 'replay',
  questions: 'question',
  scrubs: 'scrub',
  orbits: 'orbit',
  spread: 'explode',
  voice: 'voice',
  stuck: 'stuck', // experimenter observations (paper condition)
  mistakes: 'error',
  asked: 'help',
}

const sec = (ms) => Math.round(ms / 100) / 10
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b)
  if (s.length === 0) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const csv = (rows) => {
  const cols = Object.keys(rows[0] ?? {})
  const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}

const sessions = []
const steps = []
for (const file of files) {
  let log
  try {
    // Strip a byte-order mark: Windows editors add one when a log is opened and resaved.
    log = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))
  } catch (err) {
    console.warn(`skipping ${file}: ${err.message}`)
    continue
  }
  const events = log.events ?? []
  const enters = events.filter((e) => e.type === 'step_enter')
  const finish = events.find((e) => e.type === 'finish')
  const end = finish?.at ?? events.at(-1)?.at ?? 0

  const perStep = new Map() // step id -> ms
  enters.forEach((e, i) => {
    const until = enters[i + 1]?.at ?? end
    const id = e.data?.id ?? `step-${e.step + 1}`
    perStep.set(id, (perStep.get(id) ?? 0) + Math.max(0, until - e.at))
  })

  const row = {
    file: basename(file),
    participant: log.participant || '',
    condition: log.condition,
    product: log.product,
    finished: finish ? 'yes' : 'no',
    total_s: sec(end - (enters[0]?.at ?? 0)),
  }
  for (const [name, type] of Object.entries(COUNTS)) row[name] = events.filter((e) => e.type === type).length
  sessions.push(row)

  for (const [id, ms] of perStep) {
    const base = log.baseline?.[id]
    steps.push({
      participant: row.participant,
      condition: row.condition,
      product: row.product,
      step: id,
      seconds: sec(ms),
      baseline_median_s: base ? Math.round(base.medianSec) : '',
      vs_baseline: base ? Math.round((ms / 1000 / base.medianSec) * 100) / 100 : '',
    })
  }
}

if (sessions.length === 0) {
  console.error('no readable logs')
  process.exit(1)
}
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'sessions.csv'), csv(sessions))
writeFileSync(join(out, 'steps.csv'), csv(steps))

// Medians per condition, for a first look (do the real statistics in R/Python/a spreadsheet).
const conditions = [...new Set(sessions.map((s) => s.condition))]
console.log(`${sessions.length} sessions → ${out}/sessions.csv, ${out}/steps.csv\n`)
const cols = ['total_s', ...Object.keys(COUNTS)]
console.log(['condition', 'n', ...cols.map((c) => `median ${c}`)].join('\t'))
for (const c of conditions) {
  const rows = sessions.filter((s) => s.condition === c)
  console.log([c, rows.length, ...cols.map((k) => median(rows.map((r) => r[k])))].join('\t'))
}

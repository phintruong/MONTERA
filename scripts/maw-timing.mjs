// Per-step timing from IKEA Manuals at Work (Liu et al., NeurIPS 2024 D&B, CC BY 4.0):
// manual steps aligned to real assembly videos from the internet. Writes
// src/data/maw-timing.json, keyed like IKEA-Manual objects ("Chair/stig").
//
//   node scripts/maw-timing.mjs   (downloads data.json, ~200 MB, into datasets/maw/)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const URL_DATA = 'https://media.githubusercontent.com/media/yunongLiu1/IKEA-Manuals-at-Work/HEAD/data/data.json'
const DIR = new URL('../datasets/maw/', import.meta.url)
const FILE = new URL('data.json', DIR)

if (!existsSync(FILE)) {
  console.log('downloading IKEA Manuals at Work annotations (~200 MB)…')
  const res = await fetch(URL_DATA)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, Buffer.from(await res.arrayBuffer()))
}

const round = (x) => Math.round(x * 10) / 10
function summary(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return { medianSec: round(median), p25Sec: round(at(0.25)), p75Sec: round(at(0.75)), n: s.length }
}

const out = {
  source: {
    name: 'IKEA Manuals at Work (Liu et al., NeurIPS 2024)',
    url: 'https://github.com/yunongLiu1/IKEA-Manuals-at-Work',
    license: 'CC BY 4.0',
    note: 'Step times from manual steps aligned to real assembly videos from the internet.',
  },
  objects: {},
}
for (const e of JSON.parse(readFileSync(FILE, 'utf8'))) {
  out.objects[`${e.category}/${e.name}`] = {
    videos: new Set(e.steps.flatMap((s) => s.video.map((v) => v.video_id))).size,
    steps: e.steps.map((s) => {
      const d = s.video.map((v) => v.step_duration).filter((x) => x > 0)
      return d.length ? summary(d) : null
    }),
  }
}
writeFileSync(new URL('../src/data/maw-timing.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`wrote src/data/maw-timing.json (${Object.keys(out.objects).length} objects)`)

// Real-world timing for the LACK products from the IKEA ASM dataset (~95 recorded builds each).
// Downloads the action annotations (~330 KB zip, not the videos) into datasets/ikea-asm/ and
// writes src/data/asm/<product>.json, which the gen-*.mjs scripts merge into the steps.
//
//   node scripts/asm-stats.mjs && node scripts/gen-lack.mjs && node scripts/gen-lack-shelf.mjs
//
// Dataset: Ben-Shabat et al., "The IKEA ASM Dataset", WACV 2021. https://ikeaasm.github.io/
// Licence: CC BY-NC 4.0. Only derived statistics are committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

const ZIP_URL = 'https://drive.usercontent.google.com/download?id=1SwBNLViktSpk99jhh3sMXVGTMVr6tpju&export=download&confirm=t'
const DIR = new URL('../datasets/ikea-asm/', import.meta.url)
const SEGMENTS = new URL('gt_segments.json', DIR)
const OUT = new URL('../src/data/asm/', import.meta.url)
const FPS = 24 // Kinect V2 capture rate reported in the paper (~24 fps)

const TOP = ['pick up table top', 'flip table top', 'lay down table top', 'push table top']
const LEGS = ['pick up leg', 'align leg screw with table thread', 'spin leg', 'tighten leg', 'rotate table', 'lay down leg']
const FLIP = ['flip table', 'push table']
const SHELF = ['pick up shelf', 'attach shelf to table', 'lay down shelf', 'flip shelf']

// ASM atomic actions -> our step ids. Steps that are not listed (screws, brackets, wall anchor)
// have no ASM equivalent: in the recordings the screws are already in the legs, and the shelf
// is attached in one "attach shelf to table" action.
const PRODUCTS = {
  lack: {
    prefix: 'Lack_Side_Table/',
    name: 'LACK side table',
    steps: { 'top-down': TOP, 'legs-onto-top': LEGS, 'flip-upright': FLIP },
  },
  'lack-coffee': {
    prefix: 'Lack_Coffee_Table/',
    name: 'LACK coffee table',
    steps: { 'top-down': TOP, 'legs-onto-top': LEGS, 'flip-upright': FLIP, 'shelf-in': SHELF },
  },
  'lack-tv': {
    prefix: 'Lack_TV_Bench/',
    name: 'LACK TV bench',
    steps: { 'top-down': TOP, 'legs-onto-top': LEGS, 'flip-upright': FLIP, 'shelf-in': SHELF },
  },
}

// Minimal reader for one deflated entry of a zip file.
function unzipEntry(buf, name) {
  for (let i = 0; i + 30 < buf.length; ) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break
    const method = buf.readUInt16LE(i + 8)
    const size = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const entry = buf.toString('utf8', i + 30, i + 30 + nameLen)
    const start = i + 30 + nameLen + extraLen
    if (entry === name) {
      const data = buf.subarray(start, start + size)
      return method === 8 ? inflateRawSync(data) : data
    }
    i = start + size
  }
  throw new Error(`${name} not found in zip`)
}

async function loadSegments() {
  if (!existsSync(SEGMENTS)) {
    console.log('downloading IKEA ASM action annotations…')
    const res = await fetch(ZIP_URL)
    if (!res.ok) throw new Error(`download failed: ${res.status}`)
    mkdirSync(DIR, { recursive: true })
    writeFileSync(SEGMENTS, unzipEntry(Buffer.from(await res.arrayBuffer()), 'gt_segments.json'))
  }
  return JSON.parse(readFileSync(SEGMENTS, 'utf8')).database
}

const round = (x) => Math.round(x * 10) / 10
function summary(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const at = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  return { medianSec: round(median), p25Sec: round(at(0.25)), p75Sec: round(at(0.75)), n: s.length }
}
const share = (k, n) => Math.round((100 * k) / n)
const sec = (seg) => (seg.to - seg.from + 1) / FPS
const count = (b, label) => b.segs.filter((s) => s.label === label).length

function stats(db, { prefix, name, steps: stepActions }) {
  const builds = Object.entries(db)
    .filter(([k]) => k.startsWith(prefix))
    .map(([k, v]) => ({
      floor: k.includes('_floor_'),
      segs: v.annotation.map((a) => ({ label: a.label, from: a.segment[0], to: a.segment[1] })),
    }))
  const n = builds.length

  // Step time = wall clock from the first to the last action of that step, pauses included,
  // so it compares with the time between step_enter events in our study log.
  const steps = {}
  for (const [id, labels] of Object.entries(stepActions)) {
    const spans = []
    for (const b of builds) {
      const mine = b.segs.filter((s) => labels.includes(s.label))
      if (mine.length) spans.push((mine.at(-1).to - mine[0].from + 1) / FPS)
    }
    steps[id] = summary(spans)
  }

  const total = (b) => (b.segs.at(-1).to - b.segs[0].from + 1) / FPS
  const perLeg = (label) => summary(builds.flatMap((b) => b.segs.filter((s) => s.label === label).map(sec)))

  return {
    source: {
      name: 'IKEA ASM Dataset (Ben-Shabat et al., WACV 2021)',
      url: 'https://ikeaasm.github.io/',
      license: 'CC BY-NC 4.0',
      note: `Derived from action annotations of ${n} ${name} builds at ~${FPS} fps.`,
    },
    builds: n,
    total: summary(builds.map(total)),
    totalFloor: summary(builds.filter((b) => b.floor).map(total)),
    totalTable: summary(builds.filter((b) => !b.floor).map(total)),
    steps,
    perLeg: {
      align: perLeg('align leg screw with table thread'),
      spin: perLeg('spin leg'),
    },
    // Signals of trouble: more aligns/spins than legs means a leg was re-started.
    pctRealigned: share(builds.filter((b) => count(b, 'align leg screw with table thread') > 4).length, n),
    pctRespun: share(builds.filter((b) => count(b, 'spin leg') > 4).length, n),
    pctSeparateTighten: share(builds.filter((b) => count(b, 'tighten leg') > 0).length, n),
    pctRotatedTable: share(builds.filter((b) => count(b, 'rotate table') > 0).length, n),
    pctFlippedTwice: share(builds.filter((b) => count(b, 'flip table') > 1).length, n),
  }
}

const db = await loadSegments()
mkdirSync(OUT, { recursive: true })
for (const [id, spec] of Object.entries(PRODUCTS)) {
  const out = stats(db, spec)
  writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify(out, null, 2) + '\n')
  console.log(`wrote src/data/asm/${id}.json: ${out.builds} builds, median ${out.total.medianSec} s`)
}

// Generates a step guide for each of the 102 IKEA-Manual objects:
// public/products/<id>.json (fetched on demand) and src/data/catalog.json (the picker list).
//
//   python scripts/extract-ikea-manual.py   # parquet -> datasets/ikea-manual/objects/*.json
//   node scripts/maw-timing.mjs             # optional: real step times for 36 of them
//   node scripts/import-ikea-manual.mjs
//
// Source: Wang et al., "IKEA-Manual: Seeing Shape Assembly Step by Step", NeurIPS 2022.
// Each object has part meshes in assembled position and the manual's step plan (which parts and
// sub-assemblies are joined in each step, and on which manual page). The meshes leave out screws
// and fittings and have no real units, so every guide points at the manual page for fittings and
// is scaled to a typical height for its kind of furniture (marked approximate).
//
// Generated guides start with every part laid out in an exploded view around the finished
// shape. Each step slides that step's new parts into place, in the manual's order.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { about } from './lib/asm.mjs'

const SRC = new URL('../datasets/ikea-manual/objects/', import.meta.url)
const OUT = new URL('../public/products/', import.meta.url)
const TIMING = new URL('../src/data/maw-timing.json', import.meta.url)
const timing = existsSync(TIMING) ? JSON.parse(readFileSync(TIMING, 'utf8')) : null

// Hand-made guides already cover these.
const SKIP = new Set(['Table/lack'])

// Typical overall height (mm) per category, and known or likely heights for specific products.
const HEIGHT = { Chair: 820, Bench: 480, Table: 600, Desk: 750, Shelf: 1200, Misc: 800 }
const HEIGHT_OF = {
  'Chair/marius': 450, 'Chair/bekvam_3017': 500, 'Chair/grubban': 450, 'Chair/kyrre': 450,
  'Chair/mammut_1': 670, 'Chair/mammut_2': 300, 'Chair/sundvik': 590, 'Chair/stig': 900,
  'Chair/nordviken': 1000, 'Chair/poang_1': 390, 'Chair/poang_2': 1000, 'Chair/skogsta_2': 450,
  'Bench/tjusig': 500, 'Bench/applaro': 450,
  'Table/fjallbo': 460, 'Table/gladom': 530, 'Table/tornviken': 900, 'Table/vittsjo_2': 740, 'Table/applaro': 720,
  'Desk/alex': 760, 'Shelf/laiva': 1650, 'Misc/vesken': 710, 'Misc/vittsjo_2': 650,
}

// Product family names with their real spelling.
const SPELLING = {
  bekvam: 'BEKVÄM', applaro: 'ÄPPLARÖ', poang: 'POÄNG', ronninge: 'RÖNNINGE', fjallbo: 'FJÄLLBO',
  vittsjo: 'VITTSJÖ', sjalland: 'SJÄLLAND', norraker: 'NORRÅKER', borje: 'BÖRJE', froset: 'FRÖSET',
  voxlov: 'VOXLÖV', vaniljstang: 'VANILJSTÅNG', bjorkudden: 'BJÖRKUDDEN', pahl: 'PÅHL', ragrund: 'RÅGRUND',
  ekenas: 'EKENÄSET',
}
const KIND = {
  Chair: 'chair', Bench: 'bench', Table: 'table', Desk: 'desk', Shelf: 'shelf', Misc: 'furniture',
}
const KIND_OF = {
  'Chair/marius': 'stool', 'Chair/bekvam_3017': 'step stool', 'Chair/grubban': 'step stool', 'Chair/kyrre': 'stool',
  'Chair/mammut_1': 'children’s chair', 'Chair/mammut_2': 'children’s stool', 'Chair/sundvik': 'children’s chair',
  'Chair/stig': 'bar stool', 'Chair/nordviken': 'bar stool', 'Chair/poang_1': 'footstool', 'Chair/poang_2': 'armchair',
  'Chair/skogsta_2': 'bench', 'Misc/vesken': 'trolley', 'Misc/vittsjo_2': 'laptop stand', 'Misc/satsumas': 'plant stand',
  'Misc/satsumas_2': 'plant stand', 'Table/satsumas': 'plant stand', 'Table/tornviken': 'kitchen island',
  'Table/gladom': 'tray table', 'Shelf/laiva': 'bookcase', 'Shelf/vesken': 'shelf unit',
}

const r1 = (x) => Math.round(x * 10) / 10 + 0
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const plural = (word, n) => (n === 1 ? word : word.endsWith('s') ? word : `${word}s`)
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Outline edges for the manual line-drawing look: mesh boundaries and folds sharper than
 * `deg`. Ignores triangle winding (many source meshes mix it, which makes three's
 * EdgesGeometry draw every flat-face diagonal) and welds vertices that share a position.
 */
function featureEdges(pos, tris, deg = 35) {
  const weld = new Map()
  const id = (i) => {
    const key = `${pos[3 * i]},${pos[3 * i + 1]},${pos[3 * i + 2]}`
    if (!weld.has(key)) weld.set(key, i)
    return weld.get(key)
  }
  const normal = (a, b, c) => {
    const u = [0, 1, 2].map((k) => pos[3 * b + k] - pos[3 * a + k])
    const v = [0, 1, 2].map((k) => pos[3 * c + k] - pos[3 * a + k])
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const len = Math.hypot(...n)
    return len > 1e-9 ? n.map((x) => x / len) : null
  }
  const faces = new Map() // "a-b" -> normals of the triangles using that edge
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]].map(id)
    const n = normal(a, b, c)
    if (!n) continue
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const key = x < y ? `${x}-${y}` : `${y}-${x}`
      if (!faces.has(key)) faces.set(key, [])
      faces.get(key).push(n)
    }
  }
  const cos = Math.cos((deg * Math.PI) / 180)
  const out = []
  for (const [key, ns] of faces) {
    const sharp = ns.length === 1 || ns.some((n) => ns.some((m) => Math.abs(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]) < cos))
    if (sharp) out.push(...key.split('-').map(Number))
  }
  return out
}

function bbox(v) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], v[i + k])
      max[k] = Math.max(max[k], v[i + k])
    }
  }
  return { min, max, size: max.map((x, k) => x - min[k]), centre: max.map((x, k) => (x + min[k]) / 2) }
}

/** leg / rail / board / panel / piece, from the part's proportions in its assembled pose. */
function kindOf(size) {
  const axes = [0, 1, 2].sort((a, b) => size[b] - size[a])
  const [a, b, c] = axes.map((k) => size[k])
  if (c < 0.3 * b && b > 0.12 * a) return axes[2] === 1 ? 'board' : 'panel' // flat: a side, a seat, a shelf
  if (b < 0.3 * a) return axes[0] === 1 ? 'leg' : 'rail' // long and thin
  return 'piece'
}

/** "2 legs and a rail" */
function describe(kinds) {
  const counts = new Map()
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1)
  const words = [...counts].map(([k, n]) => (n === 1 ? `${/^[aeiou]/.test(k) ? 'an' : 'a'} ${k}` : `${n} ${plural(k, n)}`))
  return words.length < 2 ? words[0] ?? '' : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

function build(obj) {
  const key = `${obj.category}/${obj.name}`
  const [family, variant] = obj.name.split('_')
  const name = `${SPELLING[family] ?? family.toUpperCase()} ${KIND_OF[key] ?? KIND[obj.category] ?? 'furniture'}${variant ? ` (${variant})` : ''}`
  const id = `im-${obj.category}-${obj.name}`.toLowerCase().replace(/_/g, '-')

  // ---- scale and place: centred on x/z, standing on y = 0, millimetres ----------------
  const all = bbox(obj.parts.flatMap((p) => p.v))
  const height = HEIGHT_OF[key] ?? HEIGHT[obj.category] ?? 800
  const s = height / all.size[1]
  const toMm = (x, k) => (k === 1 ? (x - all.min[1]) * s : (x - all.centre[k]) * s)

  const parts = {}
  const home = new Map() // annotation id -> assembled centre (mm)
  const info = new Map() // annotation id -> { kind, size, sig }
  for (const p of obj.parts) {
    const b = bbox(p.v)
    const c = b.centre.map(toMm)
    const size = b.size.map((x) => r1(x * s))
    const positions = p.v.map((x, i) => r1(toMm(x, i % 3) - c[i % 3]))
    const kind = kindOf(size)
    const sig = `${kind}:${[...size].sort((x, y) => x - y).map((x) => Math.round(x / 10)).join('x')}` // same kind, same size to the cm
    info.set(p.ann, { kind, size, sig })
    home.set(p.ann, c)
    parts[`p${p.ann}`] = {
      name: `${cap(kind)}, about ${Math.max(1, Math.round(Math.max(...size) / 10))} cm`,
      shape: 'mesh',
      size,
      color: '#fbfaf6',
      mesh: { positions, indices: p.t, edges: featureEdges(positions, p.t) },
    }
  }

  // Letters in the order the manual first uses each part.
  const order = []
  for (const st of obj.steps) for (const tok of st.parts) for (const a of tok.split(',')) if (!order.includes(a)) order.push(a)
  for (const a of home.keys()) if (!order.includes(a)) order.push(a)
  const letter = new Map(order.map((a, i) => [a, LETTERS[i] ?? String(i + 1)]))

  // ---- exploded layout: push each part outward from the centre, and a little up -------
  const H = height
  const W = Math.max(all.size[0], all.size[2]) * s
  const exploded = new Map()
  order.forEach((a, i) => {
    const c = home.get(a)
    if (!c) return
    let dx = c[0]
    let dz = c[2]
    const len = Math.hypot(dx, dz)
    if (len < W * 0.08) {
      const ang = (i / order.length) * Math.PI * 2 + 0.6
      dx = Math.cos(ang)
      dz = Math.sin(ang)
    } else {
      dx /= len
      dz /= len
    }
    const push = W * 0.4 + 80
    exploded.set(a, [r1(c[0] + dx * push), r1(c[1] + H * 0.12 + 40), r1(c[2] + dz * push)])
  })

  const instances = order
    .filter((a) => home.has(a))
    .map((a) => ({ id: `p${a}`, part: `p${a}`, label: letter.get(a), initial: { pos: exploded.get(a) }, enterStep: 0 }))

  // One camera for the whole product, framing the exploded layout.
  const reach = W * 0.4 + 80 + W / 2
  const radius = Math.max(reach, H)
  const target = [0, r1(H * 0.45), 0]
  const dir = [0.62, 0.5, 0.95]
  const dl = Math.hypot(...dir)
  const camera = { position: dir.map((d, k) => r1(target[k] + (d / dl) * radius * 3.1)), target }

  // ---- steps ---------------------------------------------------------------------------
  const placed = new Set()
  const steps = obj.steps.map((st, si) => {
    const tokens = st.parts
    const members = [...new Set(tokens.flatMap((t) => t.split(',')))].filter((a) => home.has(a))
    const fresh = members.filter((a) => !placed.has(a))
    const joinsBuilt = members.some((a) => placed.has(a))
    const kinds = fresh.map((a) => info.get(a).kind)
    const labels = fresh.map((a) => letter.get(a)).join(', ')
    const page = st.page_id

    const moves = fresh.map((a, i) => {
      const start = r1(fresh.length > 1 ? (0.5 * i) / (fresh.length - 1) : 0.1) / 1
      return {
        instance: `p${a}`,
        to: { pos: home.get(a).map(r1), rot: [0, 0, 0] },
        start: Math.min(start, 0.55),
        end: Math.min(1, Math.min(start, 0.55) + 0.45),
      }
    })
    fresh.forEach((a) => placed.add(a))

    let title
    let instruction
    let check
    if (fresh.length === 0) {
      title = 'Join the assemblies'
      instruction = 'Join the parts you have built so far, as the animation shows.'
      check = 'The assemblies are joined'
    } else if (!joinsBuilt && si === 0) {
      title = `Start with ${describe(kinds)}`
      instruction = `Join ${describe(kinds)} (${labels}), as the animation shows.`
      check = `${cap(describe(kinds))} ${fresh.length > 1 ? 'are' : 'is'} joined`
    } else {
      title = `Add ${describe(kinds)}`
      instruction = `Attach ${describe(kinds)} (${labels}) ${joinsBuilt ? 'to what you have built so far' : 'to each other'}, as the animation shows.`
      check = `${cap(describe(kinds))} ${fresh.length > 1 ? 'are' : 'is'} attached`
    }

    // Tray: identical parts grouped ("Leg, about 42 cm ×4").
    const groups = new Map()
    for (const a of fresh) {
      const sig = info.get(a).sig
      if (!groups.has(sig)) groups.set(sig, { part: `p${a}`, count: 0 })
      groups.get(sig).count++
    }

    return {
      id: `step-${si + 1}`,
      title,
      instruction: `${instruction} Page ${page} of the IKEA manual shows this step.`,
      durationSec: r1(Math.min(7, 2.5 + 0.6 * fresh.length)),
      camera,
      moves,
      active: members.map((a) => `p${a}`),
      tray: [...groups.values()],
      // No per-step warning: the instruction names the manual page; product.note covers fittings.
      checklist: [check],
      faq: [
        {
          keywords: ['which screw', 'screw', 'screws', 'bolt', 'dowel', 'hardware', 'fitting', 'allen'],
          answer: `This guide doesn’t show fittings for the ${name}. Page ${page} of the paper manual shows which ones to use and how many.`,
        },
        {
          keywords: ['which part', 'which piece', 'what part', 'where'],
          answer: fresh.length
            ? `The blue ${plural('part', fresh.length)}: ${fresh.map((a) => `${letter.get(a)} (${info.get(a).kind}, about ${Math.round(Math.max(...info.get(a).size) / 10)} cm)`).join(', ')}. Watch where ${fresh.length > 1 ? 'they go' : 'it goes'} in the animation.`
            : 'No new parts in this step: join what you have already built.',
        },
        {
          keywords: ['size', 'scale', 'big', 'real'],
          answer: `Sizes are approximate: this model has no real measurements, so it is shown about ${Math.round(height / 10)} cm tall.`,
        },
      ],
    }
  })

  const data = {
    product: {
      id,
      name,
      dims: `≈ ${Math.round(height / 10)} cm tall (approximate)`,
      category: obj.category,
      approxScale: true,
      note: `Parts only: screws and fittings aren’t shown, and sizes are approximate. Each step names the page of your paper manual to follow.`,
    },
    parts,
    instances,
    steps,
    sources: [],
  }

  // Real step times where IKEA Manuals at Work aligned this object's manual to videos.
  const t = timing?.objects[key]
  if (t && t.steps.length === steps.length) {
    data.sources.push(timing.source)
    steps.forEach((st, i) => {
      const typ = t.steps[i]
      if (!typ || typ.n < 3) return
      st.typical = typ
      st.faq.push({
        keywords: ['how long', 'too long', 'too slow', 'taking long', 'normal'],
        answer: `In ${typ.n} assembly videos, people took ${about(typ.medianSec)} on this step. Take your time.`,
      })
    })
  }
  data.sources.push({
    name: 'IKEA-Manual (Wang et al., NeurIPS 2022)',
    url: 'https://cs.stanford.edu/~rcwang/projects/ikea_manual/',
    license: 'CC BY-NC-SA 4.0 (annotations); meshes and manuals belong to their creators',
    note: 'Part meshes and the manual’s step plan.',
  })
  return data
}

mkdirSync(OUT, { recursive: true })
const catalog = []
for (const file of readdirSync(SRC).sort()) {
  const obj = JSON.parse(readFileSync(new URL(file, SRC), 'utf8'))
  if (SKIP.has(`${obj.category}/${obj.name}`)) continue
  const data = build(obj)
  writeFileSync(new URL(`${data.product.id}.json`, OUT), JSON.stringify(data))
  catalog.push({
    id: data.product.id,
    name: data.product.name,
    category: obj.category,
    steps: data.steps.length,
    timed: data.steps.some((s) => s.typical),
  })
}
catalog.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
writeFileSync(new URL('../src/data/catalog.json', import.meta.url), JSON.stringify(catalog, null, 1) + '\n')
console.log(`wrote ${catalog.length} products to public/products/ (${catalog.filter((c) => c.timed).length} with video timing)`)

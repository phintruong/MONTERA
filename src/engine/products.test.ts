import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { generated, productIds, products } from '../data/products'
import { parseAssembly } from '../data/schema'
import { frameAt } from './pose'
import { answerFromFaq } from '../ask/faq'

const all = productIds.map((id) => [id, parseAssembly(products[id])] as const)
const shelfTables = all.filter(([id]) => id !== 'lack')

describe.each(all)('%s', (_, a) => {
  it('end of one step equals start of the next', () => {
    for (let s = 0; s < a.steps.length - 1; s++) {
      const end = frameAt(a, s, 1)
      const start = frameAt(a, s + 1, 0)
      for (const [id, pl] of end) {
        expect(start.get(id)!.p.distanceTo(pl.p)).toBeLessThan(1e-6)
        expect(start.get(id)!.q.angleTo(pl.q)).toBeLessThan(1e-6)
      }
    }
  })

  it('nothing sinks into the floor', () => {
    for (let s = 0; s < a.steps.length; s++) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        for (const [id, pl] of frameAt(a, s, t)) {
          if (id !== 'cardboard') expect(pl.p.y, `${a.steps[s].id} t=${t} ${id}`).toBeGreaterThan(-1)
        }
      }
    }
  })

  it('credits its real-world timing source', () => {
    expect(a.sources[0].license).toBe('CC BY-NC 4.0')
    expect(a.steps.some((s) => s.typical)).toBe(true)
  })
})

describe.each(shelfTables)('%s', (_, a) => {
  const last = a.steps.length - 1
  const end = frameAt(a, last, 1)

  it('ends upright: glossy side up, top 425 mm up, legs on the floor', () => {
    expect(new Vector3(0, 1, 0).applyQuaternion(end.get('top')!.q).y).toBeCloseTo(1, 5) // local +y is the glossy face
    expect(end.get('top')!.p.y).toBeCloseTo(425, 3)
    for (const leg of ['leg1', 'leg2', 'leg3', 'leg4']) expect(end.get(leg)!.p.y).toBeCloseTo(200, 3) // 400 mm legs standing on the floor
  })

  it('shelf rests on the brackets, between the legs', () => {
    const shelf = end.get('shelf')!.p
    for (const b of ['bracket1', 'bracket2', 'bracket3', 'bracket4']) {
      const br = end.get(b)!.p
      expect(br.y).toBeLessThan(shelf.y)
      expect(Math.abs(br.z)).toBeLessThan(a.parts.top.size[2] / 2)
    }
  })

  it('brackets stay attached through the turns', () => {
    const i = a.steps.findIndex((s) => s.id === 'brackets-b')
    const before = frameAt(a, i, 0)
    const after = frameAt(a, i, 1)
    const gap = (f: typeof before) => f.get('bracket3')!.p.distanceTo(f.get('leg3')!.p)
    expect(gap(after)).toBeCloseTo(gap(before), 3)
  })

  it('warns about long vs short screws', () => {
    const br = a.steps.find((s) => s.id === 'brackets-a')!
    expect(answerFromFaq(br, 'which screw do I use')).toMatch(/108530/)
  })
})

// Generated guides live in public/products/ and are fetched at runtime; check them all here.
const modules = import.meta.glob<unknown>('../../public/products/*.json', { eager: true, import: 'default' })
const files = Object.keys(modules).map((path) => path.split('/').pop()!)
const fromCatalog = (from: string) => generated.filter((c) => c.from === from).map((c) => `${c.id}.json`)

it('one generated file per catalog entry', () => {
  expect(files.sort()).toEqual(generated.map((c) => `${c.id}.json`).sort())
})

/** Lowest point of any part (its box corners) at this moment. */
function lowest(a: ReturnType<typeof parseAssembly>, s: number, t: number) {
  let min = Infinity
  for (const inst of a.instances) {
    const pl = frameAt(a, s, t).get(inst.id)
    if (!pl) continue
    const [w, h, d] = a.parts[inst.part].size
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const y = new Vector3((sx * w) / 2, (sy * h) / 2, (sz * d) / 2).applyQuaternion(pl.q).add(pl.p).y
          min = Math.min(min, y)
        }
  }
  return min
}

describe('simplified flat-pack guides', () => {
  it.each(fromCatalog('flatpack'))('%s keeps continuity, stays above the floor and ends standing', (file: string) => {
    const a = parseAssembly(modules[`../../public/products/${file}`])
    for (let s = 0; s < a.steps.length; s++) {
      for (const t of [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1]) expect(lowest(a, s, t), `${a.steps[s].id} t=${t}`).toBeGreaterThan(-1)
      if (s < a.steps.length - 1) {
        const end = frameAt(a, s, 1)
        const start = frameAt(a, s + 1, 0)
        for (const [id, pl] of end) expect(start.get(id)!.p.distanceTo(pl.p)).toBeLessThan(1e-6)
      }
    }
    // Upright at the end: every built part is unrotated and the whole thing rests on the floor.
    const last = a.steps.length - 1
    const end = frameAt(a, last, 1)
    for (const id of a.steps[last].active) expect(end.get(id)!.q.angleTo(new Quaternion())).toBeLessThan(1e-6)
    expect(lowest(a, last, 1)).toBeCloseTo(0, 3)
  })
})

describe('generated guides (IKEA-Manual)', () => {
  it.each(fromCatalog('ikea-manual'))('%s parses, keeps continuity and ends fully assembled', (file: string) => {
    const a = parseAssembly(modules[`../../public/products/${file}`])
    expect(a.product.approxScale).toBe(true)
    for (let s = 0; s < a.steps.length - 1; s++) {
      const end = frameAt(a, s, 1)
      const start = frameAt(a, s + 1, 0)
      for (const [id, pl] of end) expect(start.get(id)!.p.distanceTo(pl.p)).toBeLessThan(1e-6)
    }
    // Every part the manual uses ends at its assembled spot.
    const last = frameAt(a, a.steps.length - 1, 1)
    for (const m of a.steps.flatMap((s) => s.moves)) {
      if (m.kind !== 'rigid') expect(last.get(m.instance)!.p.distanceTo(new Vector3(...m.to.pos))).toBeLessThan(1e-6)
    }
    for (const s of a.steps) expect(s.instruction).toMatch(/Page \d+/)
    expect(a.product.note).toMatch(/fittings/)
  })
})

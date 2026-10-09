import { Vector3 } from 'three'
import type { Assembly } from '../data/schema'
import type { Frame } from './pose'

/** An oriented box: centre, three unit axes, half sizes along them (mm). */
interface Obb {
  c: Vector3
  axes: [Vector3, Vector3, Vector3]
  half: [number, number, number]
}

function obb(a: Assembly, frame: Frame, id: string): Obb | null {
  const inst = a.instances.find((i) => i.id === id)
  const pl = frame.get(id)
  if (!inst || !pl) return null
  const [w, h, d] = a.parts[inst.part].size
  return {
    c: pl.p,
    axes: [new Vector3(1, 0, 0).applyQuaternion(pl.q), new Vector3(0, 1, 0).applyQuaternion(pl.q), new Vector3(0, 0, 1).applyQuaternion(pl.q)],
    half: [w / 2, h / 2, d / 2],
  }
}

/**
 * How far two oriented boxes overlap (mm), by the separating axis theorem: the smallest overlap
 * over the 15 candidate axes. 0 or less means they don't intersect (touching counts as 0).
 */
export function penetration(A: Obb, B: Obb): number {
  const d = B.c.clone().sub(A.c)
  const candidates: Vector3[] = [...A.axes, ...B.axes]
  for (const u of A.axes) for (const v of B.axes) {
    const x = u.clone().cross(v)
    if (x.lengthSq() > 1e-8) candidates.push(x.normalize())
  }
  let min = Infinity
  for (const n of candidates) {
    const ra = A.half.reduce((s, h, i) => s + h * Math.abs(A.axes[i].dot(n)), 0)
    const rb = B.half.reduce((s, h, i) => s + h * Math.abs(B.axes[i].dot(n)), 0)
    const overlap = ra + rb - Math.abs(d.dot(n))
    if (overlap <= 0) return overlap
    min = Math.min(min, overlap)
  }
  return min
}

/**
 * Parts left hanging in mid-air: not on the floor, and not touching (within `gap` mm) a chain of
 * parts that reaches the floor. Hardware counts as support (a bracket holds a shelf).
 */
export function unsupported(a: Assembly, frame: Frame, gap = 1.5): string[] {
  const ids = a.instances.filter((i) => frame.has(i.id)).map((i) => i.id)
  const boxes = new Map(ids.map((id) => [id, obb(a, frame, id)!]))
  const lowest = (b: Obb) => b.c.y - b.half.reduce((s, h, i) => s + h * Math.abs(b.axes[i].y), 0)
  const grounded = new Set(ids.filter((id) => lowest(boxes.get(id)!) < gap))
  let grew = true
  while (grew) {
    grew = false
    for (const id of ids) {
      if (grounded.has(id)) continue
      if ([...grounded].some((g) => penetration(boxes.get(id)!, boxes.get(g)!) > -gap)) {
        grounded.add(id)
        grew = true
      }
    }
  }
  return ids.filter((id) => !grounded.has(id))
}

/** Parts a straight arrow from `from` to `to` passes through (more than `tolerance` mm inside). */
export function arrowHits(a: Assembly, frame: Frame, from: Vector3, to: Vector3, tolerance = 2): string[] {
  const hits: string[] = []
  for (const inst of a.instances) {
    const b = frame.has(inst.id) ? obb(a, frame, inst.id) : null
    if (!b) continue
    // Slab test in the box's own frame, with the box shrunk by the tolerance.
    let t0 = 0
    let t1 = 1
    const o = from.clone().sub(b.c)
    const dir = to.clone().sub(from)
    for (let i = 0; i < 3 && t0 <= t1; i++) {
      const e = b.half[i] - tolerance
      const p = o.dot(b.axes[i])
      const v = dir.dot(b.axes[i])
      if (e <= 0) {
        t0 = 2 // too thin to "pass through"
      } else if (Math.abs(v) < 1e-9) {
        if (Math.abs(p) > e) t0 = 2
      } else {
        const [ta, tb] = [(-e - p) / v, (e - p) / v].sort((x, y) => x - y)
        t0 = Math.max(t0, ta)
        t1 = Math.min(t1, tb)
      }
    }
    if (t0 <= t1) hits.push(inst.id)
  }
  return hits
}

/** Pairs of non-hardware parts on screen that overlap by more than `tolerance` mm in this frame. */
export function collisions(a: Assembly, frame: Frame, tolerance = 2): { a: string; b: string; depth: number }[] {
  const solid = a.instances.filter((i) => !a.parts[i.part].hardware && frame.has(i.id)).map((i) => i.id)
  const boxes = new Map(solid.map((id) => [id, obb(a, frame, id)!]))
  const hits = []
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const depth = penetration(boxes.get(solid[i])!, boxes.get(solid[j])!)
      if (depth > tolerance) hits.push({ a: solid[i], b: solid[j], depth: Math.round(depth) })
    }
  }
  return hits
}

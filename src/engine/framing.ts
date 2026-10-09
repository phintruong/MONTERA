import { Vector3 } from 'three'
import type { Assembly } from '../data/schema'
import { frameAt } from './pose'

export const FOV = 38 // vertical, degrees; the scene camera uses the same
const SAMPLES = 12
const MARGIN = 1.12 // breathing room, and space for the controls floating over the view
const MIN_DISTANCE = 700 // mm: never so close that a screw fills the screen

/**
 * Every point the step is about, over the whole step: the corners of its active parts and of
 * anything it moves, at each sampled moment, plus its arrows. Cached per assembly.
 */
const cache = new WeakMap<Assembly, Vector3[][]>()
export function stepPoints(a: Assembly, step: number): Vector3[] {
  let all = cache.get(a)
  if (!all) {
    all = a.steps.map((_, s) => collect(a, s))
    cache.set(a, all)
  }
  return all[step]
}

function collect(a: Assembly, s: number): Vector3[] {
  const st = a.steps[s]
  const ids = new Set([...st.active, ...st.moves.flatMap((m) => (m.kind === 'rigid' ? m.group : [m.instance]))])
  const pts: Vector3[] = []
  for (let k = 0; k <= SAMPLES; k++) {
    const frame = frameAt(a, s, k / SAMPLES)
    for (const id of ids) {
      const pl = frame.get(id)
      if (!pl) continue
      const [w, h, d] = a.parts[a.instances.find((i) => i.id === id)!.part].size
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        pts.push(new Vector3((x * w) / 2, (y * h) / 2, (z * d) / 2).applyQuaternion(pl.q).add(pl.p))
      }
    }
  }
  for (const arrow of st.arrows) pts.push(new Vector3(...arrow.from), new Vector3(...arrow.to))
  // A step that touches nothing (rare): fall back to its authored target.
  if (pts.length === 0) pts.push(new Vector3(...st.camera.target))
  return pts
}

/**
 * Camera for a step on a canvas of this aspect (width / height): looks from the step's authored
 * direction, at the middle of everything the step is about, from just far enough that all of it
 * fits. Returns mm.
 */
export function frameStep(a: Assembly, step: number, aspect: number): { position: Vector3; target: Vector3 } {
  const pts = stepPoints(a, step)
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const p of pts) {
    min.min(p)
    max.max(p)
  }
  const target = min.add(max).multiplyScalar(0.5)

  const { position, target: authored } = a.steps[step].camera
  const back = new Vector3(...position).sub(new Vector3(...authored)).normalize() // target -> camera
  const right = new Vector3(0, 1, 0).cross(back).normalize()
  const up = back.clone().cross(right)
  const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
  const tanH = tanV * aspect

  // For each point: the distance at which it sits exactly on the edge of the view.
  let distance = MIN_DISTANCE
  for (const p of pts) {
    const o = p.clone().sub(target)
    const toward = o.dot(back) // points nearer the camera need more distance
    distance = Math.max(distance, toward + Math.abs(o.dot(right)) / tanH, toward + Math.abs(o.dot(up)) / tanV)
  }
  distance *= MARGIN
  return { position: target.clone().addScaledVector(back, distance), target }
}

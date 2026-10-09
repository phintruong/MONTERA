import { Euler, Quaternion, Vector3 } from 'three'
import type { Assembly, Move, Pose, Vec3 } from '../data/schema'

// Everything the scene draws is a pure function of (step, t).
export interface Placement {
  p: Vector3 // mm
  q: Quaternion
}
export type Frame = Map<string, Placement>

const DEG = Math.PI / 180
const Y = new Vector3(0, 1, 0)

export const ease = (x: number) => x * x * (3 - 2 * x)

export function quatFromDeg(r: Vec3): Quaternion {
  return new Quaternion().setFromEuler(new Euler(r[0] * DEG, r[1] * DEG, r[2] * DEG))
}

function fromPose(pose: Pose): Placement {
  return { p: new Vector3(...pose.pos), q: quatFromDeg(pose.rot) }
}

function clone(frame: Frame): Frame {
  const out: Frame = new Map()
  for (const [id, pl] of frame) out.set(id, { p: pl.p.clone(), q: pl.q.clone() })
  return out
}

function progress(m: Move, t: number) {
  if (m.end === m.start) return t >= m.start ? 1 : 0
  return ease(Math.min(1, Math.max(0, (t - m.start) / (m.end - m.start))))
}

function applyMove(frame: Frame, m: Move, t: number) {
  const k = progress(m, t)
  if (k === 0) return
  if (m.kind === 'rigid') {
    const pivot = new Vector3(...m.pivot)
    const r = new Quaternion().slerp(quatFromDeg(m.rotate), k)
    const shift = new Vector3(...m.translate).multiplyScalar(k)
    for (const id of m.group) {
      const pl = frame.get(id)
      if (!pl) continue
      pl.p.sub(pivot).applyQuaternion(r).add(pivot).add(shift)
      pl.q.premultiply(r)
    }
    return
  }
  const pl = frame.get(m.instance)
  if (!pl) return
  const to = fromPose(m.to)
  pl.p.lerp(to.p, k)
  pl.q.slerp(to.q, k)
  if (m.spin) pl.q.multiply(new Quaternion().setFromAxisAngle(Y, m.spin * 2 * Math.PI * k))
}

function evaluate(a: Assembly, step: number, t: number, start: Frame): Frame {
  const frame = clone(start)
  for (const inst of a.instances) {
    if (inst.enterStep === step && !frame.has(inst.id)) frame.set(inst.id, fromPose(inst.initial))
  }
  const moves = [...a.steps[step].moves].sort((x, y) => x.start - y.start)
  for (const m of moves) applyMove(frame, m, t)
  return frame
}

const startCache = new WeakMap<Assembly, Frame[]>()

/** Placement of every visible instance at the start of each step. */
function stepStarts(a: Assembly): Frame[] {
  const cached = startCache.get(a)
  if (cached) return cached
  const starts: Frame[] = []
  let frame: Frame = new Map()
  a.steps.forEach((_, i) => {
    starts.push(frame)
    frame = evaluate(a, i, 1, frame)
  })
  startCache.set(a, starts)
  return starts
}

export function frameAt(a: Assembly, step: number, t: number): Frame {
  const s = Math.min(Math.max(0, step), a.steps.length - 1)
  return evaluate(a, s, Math.min(1, Math.max(0, t)), stepStarts(a)[s])
}

/** Push active instances away from the centroid of everything visible. */
export function explode(frame: Frame, active: string[], amount: number): Frame {
  if (amount <= 0 || active.length === 0) return frame
  const centroid = new Vector3()
  for (const pl of frame.values()) centroid.add(pl.p)
  centroid.divideScalar(frame.size)
  const out = clone(frame)
  for (const id of active) {
    const pl = out.get(id)
    if (!pl) continue
    const dir = pl.p.clone().sub(centroid)
    if (dir.lengthSq() < 1) dir.set(0, 1, 0)
    pl.p.add(dir.normalize().multiplyScalar(250 * amount))
  }
  return out
}

export interface HandPlacement extends Placement {
  pose: 'flat' | 'grip' | 'pinch'
}

/** Where the step's left or right hand is for (step, t), given the (possibly exploded) frame. */
export function handAt(a: Assembly, step: number, t: number, frame: Frame, side: 'left' | 'right'): HandPlacement | null {
  const s = a.steps[step]
  const hand = s.hands.find((h) => h.side === side)
  const target = hand && frame.get(hand.follow)
  if (!hand || !target) return null

  const offset = new Vector3(...hand.offset)
  const rot = quatFromDeg(hand.rot)
  if (hand.mode === 'local') {
    return {
      p: offset.applyQuaternion(target.q).add(target.p),
      q: target.q.clone().multiply(rot),
      pose: hand.pose,
    }
  }

  // World mode: twist back and forth about world Y, around the target, while it spins.
  let angle = 0
  const spin = s.moves.find((m) => m.kind !== 'rigid' && m.instance === hand.follow && m.spin)
  if (hand.twist && spin && spin.kind !== 'rigid' && t > spin.start && t < spin.end) {
    const raw = (t - spin.start) / (spin.end - spin.start)
    angle = hand.twist * DEG * Math.sin(raw * spin.spin * 2 * Math.PI)
  }
  const twist = new Quaternion().setFromAxisAngle(Y, angle)
  return {
    p: offset.applyQuaternion(twist).add(target.p),
    q: twist.multiply(rot),
    pose: hand.pose,
  }
}

import { z } from 'zod'

// All lengths are millimetres, all angles degrees. The scene converts to metres.
const Vec3 = z.tuple([z.number(), z.number(), z.number()])

export const Pose = z.object({
  pos: Vec3,
  rot: Vec3.default([0, 0, 0]),
})

const Part = z.object({
  name: z.string(),
  shape: z.enum(['box', 'cylinder', 'screw', 'mesh']),
  // box: [w, h, d]; cylinder/screw: [diameter, length, diameter]; mesh: bounding box
  size: Vec3,
  // mesh only: triangle mesh in mm around the part's own origin (flat xyz list, index triples),
  // plus outline edges as index pairs (drawn instead of computed, see import-ikea-manual.mjs).
  mesh: z
    .object({
      positions: z.array(z.number()),
      indices: z.array(z.number().int()),
      edges: z.array(z.number().int()).default([]),
    })
    .optional(),
  color: z.string(),
  hardware: z.boolean().default(false),
  // Local face that carries the finished (glossy) surface, e.g. "+y".
  finishedFace: z.enum(['+x', '-x', '+y', '-y', '+z', '-z']).optional(),
  finishedLabel: z.string().optional(),
})

const Instance = z.object({
  id: z.string(),
  part: z.string(),
  // Letter the instructions use for this part ("Join A and B"); drawn on it while it's active.
  label: z.string().optional(),
  initial: Pose,
  enterStep: z.number().int().min(0),
})

// Absolute move: animate an instance to a pose over [start, end] of the step.
const AbsoluteMove = z.object({
  kind: z.literal('to').default('to'),
  instance: z.string(),
  to: Pose,
  start: z.number().min(0).max(1).default(0),
  end: z.number().min(0).max(1).default(1),
  // Extra turns about the instance's local Y axis while moving (screwing).
  spin: z.number().default(0),
})

// Rigid move: rotate/translate a group of instances as one body.
const RigidMove = z.object({
  kind: z.literal('rigid'),
  group: z.array(z.string()),
  pivot: Vec3.default([0, 0, 0]),
  rotate: Vec3.default([0, 0, 0]),
  translate: Vec3.default([0, 0, 0]),
  start: z.number().min(0).max(1).default(0),
  end: z.number().min(0).max(1).default(1),
})

const Move = z.union([RigidMove, AbsoluteMove])

// How long real people took on this step (wall clock), from a research dataset.
const Typical = z.object({
  medianSec: z.number().positive(),
  p25Sec: z.number().positive(),
  p75Sec: z.number().positive(),
  n: z.number().int().positive(),
})

const Source = z.object({ name: z.string(), url: z.string(), license: z.string(), note: z.string().optional() })

const Step = z.object({
  id: z.string(),
  title: z.string(),
  instruction: z.string(),
  durationSec: z.number().positive().default(4),
  camera: z.object({ position: Vec3, target: Vec3 }),
  moves: z.array(Move),
  active: z.array(z.string()).default([]),
  showFinishedFace: z.boolean().default(false),
  arrows: z.array(z.object({ from: Vec3, to: Vec3 })).default([]),
  tray: z.array(z.object({ part: z.string(), count: z.number().int().positive() })),
  warning: z.string().optional(),
  checklist: z.array(z.string()).default([]),
  faq: z.array(z.object({ keywords: z.array(z.string()), answer: z.string() })).default([]),
  typical: Typical.optional(),
})

export const Assembly = z.object({
  product: z.object({
    id: z.string(),
    name: z.string(),
    dims: z.string(),
    category: z.string().optional(),
    // True when the model has no real units and was scaled to a typical height.
    approxScale: z.boolean().default(false),
    // The paper manual this guide follows (steps reference its pages).
    manual: z.object({ id: z.string(), url: z.string().optional() }).optional(),
    // One quiet line about what the guide leaves out, shown once instead of a yellow warning per step.
    note: z.string().optional(),
  }),
  parts: z.record(z.string(), Part),
  instances: z.array(Instance),
  steps: z.array(Step).min(1),
  sources: z.array(Source).default([]),
})

export type Vec3 = z.infer<typeof Vec3>
export type Pose = z.infer<typeof Pose>
export type Part = z.infer<typeof Part>
export type Instance = z.infer<typeof Instance>
export type Move = z.infer<typeof Move>
export type Step = z.infer<typeof Step>
export type Assembly = z.infer<typeof Assembly>

export function parseAssembly(raw: unknown): Assembly {
  const a = Assembly.parse(raw)
  const ids = new Set(a.instances.map((i) => i.id))
  for (const inst of a.instances) {
    if (!a.parts[inst.part]) throw new Error(`instance ${inst.id}: unknown part ${inst.part}`)
  }
  for (const [id, p] of Object.entries(a.parts)) {
    if ((p.shape === 'mesh') !== Boolean(p.mesh)) throw new Error(`part ${id}: mesh shape and mesh data must go together`)
  }
  a.steps.forEach((s, si) => {
    for (const m of s.moves) {
      const targets = m.kind === 'rigid' ? m.group : [m.instance]
      for (const id of targets) if (!ids.has(id)) throw new Error(`step ${si}: unknown instance ${id}`)
      if (m.end < m.start) throw new Error(`step ${si}: move ends before it starts`)
    }
    for (const t of s.tray) if (!a.parts[t.part]) throw new Error(`step ${si}: tray has unknown part ${t.part}`)
  })
  return a
}

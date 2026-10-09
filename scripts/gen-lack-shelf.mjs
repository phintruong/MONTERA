// Generates src/data/lack-coffee.json and src/data/lack-tv.json: LACK tables with a shelf.
// Steps follow the IKEA manuals AA-472482 (coffee table) and AA-837205 (TV bench): screws into
// the top, legs on, brackets marked with the metal guide, shelf in, shelf screwed to the
// brackets, and for the TV bench a wall fitting and wall anchor.
// Shelf height comes from the LACK coffee table model in IKEA-Manual (Wang et al., NeurIPS 2022).
// Real-world timings come from src/data/asm/*.json (node scripts/asm-stats.mjs).
//
// The table is tipped onto its sides for the bracket steps, so this script tracks the rigid
// transform of the assembled body (`body.q`, `body.p`) the same way src/engine/pose.ts replays
// rigid moves, and places each new part at body-transform × its spot on the table.
import { writeFileSync } from 'node:fs'
import { Euler, Quaternion, Vector3 } from 'three'
import coffeeAsm from '../src/data/asm/lack-coffee.json' with { type: 'json' }
import tvAsm from '../src/data/asm/lack-tv.json' with { type: 'json' }
import { about, mergeAsm } from './lib/asm.mjs'

const DEG = Math.PI / 180
const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000 + 0) // +0 turns -0 into 0
const quat = (deg) => new Quaternion().setFromEuler(new Euler(deg[0] * DEG, deg[1] * DEG, deg[2] * DEG))
const euler = (q) => {
  const e = new Euler().setFromQuaternion(q, 'XYZ')
  return r3([e.x / DEG, e.y / DEG, e.z / DEG])
}

function build({ id, name, dims, L, D, shelfY, asm, wall }) {
  const H = 450 // total height
  const T = 50 // tabletop thickness
  const LEG = 50
  const cx = L / 2 - LEG / 2
  const cz = D / 2 - LEG / 2
  const corners = [[-cx, -cz], [cx, -cz], [-cx, cz], [cx, cz]]
  const legs = corners.map((_, i) => `leg${i + 1}`)
  const screws = corners.map((_, i) => `screw${i + 1}`)
  const brackets = corners.map((_, i) => `bracket${i + 1}`)
  const shelfScrews = corners.map((_, i) => `sscrew${i + 1}`)
  const frontZ = D / 2 + 260
  const rowX = [-330, -110, 110, 330]
  const SHELF_T = 13
  const shelfSize = [L - 10, SHELF_T, D - 2 * LEG - 2]
  const BR = [24, 22, 16] // bracket box

  const parts = {
    cardboard: { name: 'Cardboard (from the box)', shape: 'box', size: [L + 300, 4, D + 320], color: '#dcc093' },
    top: { name: 'Tabletop', shape: 'box', size: [L, T, D], color: '#fbfaf6', finishedFace: '+y', finishedLabel: 'Glossy side' },
    leg: { name: 'Leg', shape: 'box', size: [LEG, H - T, LEG], color: '#fbfaf6' },
    shelf: { name: 'Shelf', shape: 'box', size: shelfSize, color: '#fbfaf6' },
    screw: { name: 'Double-ended screw (115980)', shape: 'screw', size: [8, 40, 8], color: '#9a9fa5', hardware: true },
    bracket: { name: 'Angle bracket (120298)', shape: 'box', size: BR, color: '#9a9fa5', hardware: true },
    screwLong: { name: 'Screw 108530 (longer)', shape: 'screw', size: [4, 16, 4], color: '#9a9fa5', hardware: true },
    screwShort: { name: 'Screw 109041 (shorter)', shape: 'screw', size: [4, 12, 4], color: '#9a9fa5', hardware: true },
    guide: { name: 'Metal drilling guide (120938)', shape: 'box', size: [120, 3, 22], color: '#9a9fa5', hardware: true },
  }
  if (wall) {
    Object.assign(parts, {
      fitting: { name: 'Wall fitting (115753)', shape: 'box', size: [40, 30, 30], color: '#9a9fa5', hardware: true },
      fittingScrew: { name: 'Screw 100372', shape: 'screw', size: [4, 14, 4], color: '#9a9fa5', hardware: true },
      hook: { name: 'Wall hook (103693)', shape: 'box', size: [30, 40, 3], color: '#9a9fa5', hardware: true },
      cover: { name: 'Fitting cover (115754)', shape: 'box', size: [45, 35, 35], color: '#fbfaf6' },
    })
  }

  // ---- body transform: world = body.q * local + body.p --------------------------------
  // "Local" is the world frame at the moment the top lies glossy-side down on the cardboard
  // (top occupies y 0..50, legs point up). Every part's spot on the table is given in it.
  const body = { q: new Quaternion(), p: new Vector3() }
  const local = new Map() // id -> { p: Vector3, q: Quaternion, size }
  const group = () => [...local.keys()]
  const toWorld = (id) => {
    const l = local.get(id)
    return { p: l.p.clone().applyQuaternion(body.q).add(body.p), q: body.q.clone().multiply(l.q) }
  }
  const attach = (id, pos, rot, size) => local.set(id, { p: new Vector3(...pos), q: quat(rot), size })
  const worldPose = (id) => {
    const w = toWorld(id)
    return { pos: r3(w.p.toArray()), rot: euler(w.q) }
  }

  function corners3(id) {
    const { size } = local.get(id)
    const w = toWorld(id)
    const out = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      out.push(new Vector3((sx * size[0]) / 2, (sy * size[1]) / 2, (sz * size[2]) / 2).applyQuaternion(w.q).add(w.p))
    }
    return out
  }
  const bodyPoints = () => group().flatMap(corners3)
  const bodyBox = () => {
    const pts = bodyPoints()
    const min = new Vector3(Infinity, Infinity, Infinity)
    const max = new Vector3(-Infinity, -Infinity, -Infinity)
    for (const v of pts) {
      min.min(v)
      max.max(v)
    }
    return { min, max, centre: min.clone().add(max).multiplyScalar(0.5) }
  }

  /** Lift, turn the whole body by `deg` about world X through its centre, and set it down. */
  function tip(deg) {
    const ids = group()
    const { centre } = bodyBox()
    const radius = Math.max(...bodyPoints().map((v) => Math.hypot(v.y - centre.y, v.z - centre.z)))
    const lift = Math.ceil(Math.max(0, radius - centre.y) + 30)
    body.p.y += lift
    const pivot = centre.clone().setY(centre.y + lift)
    const r = quat([deg, 0, 0])
    body.p.sub(pivot).applyQuaternion(r).add(pivot)
    body.q.premultiply(r)
    const drop = Math.round(bodyBox().min.y * 1000) / 1000
    body.p.y -= drop
    return [
      { kind: 'rigid', group: ids, translate: [0, lift, 0], start: 0, end: 0.25 },
      { kind: 'rigid', group: ids, pivot: r3(pivot.toArray()), rotate: [deg, 0, 0], start: 0.25, end: 0.75 },
      { kind: 'rigid', group: ids, translate: [0, -drop, 0], start: 0.75, end: 1 },
    ]
  }

  const camAt = (target, off) => ({ position: r3(target.map((v, i) => v + off[i])), target: r3(target) })
  const bodyCam = (off = [L * 0.95, 760, D + 1050]) => camAt(bodyBox().centre.toArray(), off)

  // ---- instances ---------------------------------------------------------------------
  const steps = []
  const instances = [
    { id: 'cardboard', part: 'cardboard', initial: { pos: [0, -2, 0] }, enterStep: 0 },
    { id: 'top', part: 'top', initial: { pos: [0, 320, 0], rot: [0, 0, 0] }, enterStep: 0 },
  ]
  const enter = (id, part, initial) => instances.push({ id, part, initial, enterStep: steps.length })

  // Step: tabletop glossy side down -----------------------------------------------------
  attach('top', [0, T / 2, 0], [180, 0, 0], parts.top.size)
  steps.push({
    id: 'top-down',
    title: 'Tabletop glossy side down',
    instruction: 'Lay the cardboard flat. Put the tabletop on it with the glossy side facing down, so the pre-drilled holes face up.',
    durationSec: 3.5,
    camera: camAt([0, 60, 0], [L * 0.8, 700, D + 800]),
    moves: [{ instance: 'top', to: { pos: [0, T / 2, 0], rot: [180, 0, 0] } }],
    active: ['top'],
    showFinishedFace: true,
    arrows: [{ from: [0, 260, 0], to: [0, 90, 0] }],
    tray: [{ part: 'top', count: 1 }, { part: 'cardboard', count: 1 }],
    warning: 'Glossy side DOWN. If you can see the shiny surface, flip it. The holes must face you.',
    checklist: ['Tabletop is on the cardboard, glossy side down', 'I can see the 4 corner holes'],
    faq: [
      { keywords: ['which side', 'which way', 'up', 'down', 'glossy', 'shiny', 'flip'], answer: 'Glossy side down on the cardboard. The side with the holes faces up toward you.' },
      { keywords: ['cardboard', 'floor', 'scratch'], answer: 'Use the flattened box as a mat so the glossy top does not get scratched.' },
    ],
  })

  // Step (TV bench): wall fitting on the back edge --------------------------------------
  if (wall) {
    enter('fitting', 'fitting', { pos: [0, 15, frontZ], rot: [0, 0, 0] })
    attach('fitting', [0, T + 15, -D / 2 + 20], [0, 0, 0], parts.fitting.size)
    const at = worldPose('fitting')
    steps.push({
      id: 'wall-fitting',
      title: 'Wall fitting on the back edge',
      instruction:
        'Screw the angle-shaped wall fitting (115753) to the middle of the back edge with the 2 screws 100372. Use a Phillips screwdriver.',
      durationSec: 4,
      camera: camAt([0, 60, -D / 2], [500, 520, 900]),
      moves: [{ instance: 'fitting', to: at, start: 0, end: 0.6 }],
      active: ['fitting'],
      arrows: [{ from: [0, 200, -D / 2 + 20], to: [0, 110, -D / 2 + 20] }],
      tray: [{ part: 'fitting', count: 1 }, { part: 'fittingScrew', count: 2 }],
      checklist: ['Wall fitting is screwed to the middle of the back edge', 'Both screws are in'],
      faq: [
        { keywords: ['where', 'which edge', 'back', 'middle'], answer: 'On the plain side facing you, in the middle of one long edge. That edge becomes the back, against the wall.' },
        { keywords: ['tool', 'screwdriver'], answer: 'A Phillips (cross-head) screwdriver.' },
      ],
    })
  }

  // Step: double-ended screws into the tabletop -------------------------------------------
  corners.forEach(([x, z], i) => {
    enter(screws[i], 'screw', { pos: [-90 + 60 * i, 4, frontZ], rot: [0, 0, 90] })
    attach(screws[i], [x, T, z], [180, 0, 0], parts.screw.size)
  })
  steps.push({
    id: 'screws-into-top',
    title: 'Screws into the tabletop',
    instruction:
      'Take the 4 double-ended screws (115980). Screw one into each corner hole of the tabletop by hand, until about half the screw sticks out.',
    durationSec: 5,
    camera: bodyCam([L * 0.6, 900, D + 900]),
    moves: screws.map((s, i) => ({ instance: s, to: worldPose(s), start: 0.12 * i, end: 0.12 * i + 0.55, spin: 4 })),
    active: screws,
    arrows: corners.map(([x, z]) => ({ from: [x, 230, z], to: [x, 120, z] })),
    tray: [{ part: 'screw', count: 4 }],
    checklist: ['A screw is in each of the 4 corner holes', 'About half of each screw sticks out'],
    faq: [
      { keywords: ['which screw', 'screw', 'screws', 'hardware'], answer: 'The 4 long screws threaded at both ends (115980). They go into the tabletop corners first.' },
      { keywords: ['how far', 'halfway', 'deep'], answer: 'About halfway, so the leg has thread to grab. Hand tight is enough.' },
      { keywords: ['tool', 'screwdriver', 'drill'], answer: 'No tools for this step. Turn the screws by hand.' },
    ],
  })

  // Step: legs on -----------------------------------------------------------------------
  corners.forEach(([x, z], i) => {
    enter(legs[i], 'leg', { pos: [rowX[i], (H - T) / 2, frontZ + 120] })
    attach(legs[i], [x, T + (H - T) / 2, z], [180, 0, 0], parts.leg.size)
  })
  steps.push({
    id: 'legs-onto-top',
    title: 'Screw the legs on',
    instruction: 'Push each leg onto a screw and turn it clockwise by hand until it sits flat against the tabletop.',
    durationSec: 6,
    camera: bodyCam(),
    moves: legs.flatMap((leg, i) => {
      const s0 = 0.08 * i
      const end = worldPose(leg)
      return [
        { instance: leg, to: { pos: [end.pos[0], end.pos[1] + 80, end.pos[2]], rot: end.rot }, start: s0, end: s0 + 0.4 },
        { instance: leg, to: end, start: s0 + 0.45, end: s0 + 0.75, spin: 3 },
      ]
    }),
    active: legs,
    arrows: corners.map(([x, z]) => ({ from: [x, 760, z], to: [x, 690, z] })),
    tray: [{ part: 'leg', count: 4 }],
    warning: 'Hand tight only. Forcing it can strip the hole in the tabletop.',
    checklist: ['All 4 legs are screwed in', 'Each leg sits flat against the tabletop, no gap'],
    faq: [
      { keywords: ['which way', 'direction', 'clockwise', 'turn'], answer: 'Clockwise, looking down at the leg, like closing a jar.' },
      { keywords: ['gap', 'wobble', 'loose', 'not flat'], answer: 'Keep turning until the leg sits flat. If it stops early, unscrew it and screw it back in straight.' },
      {
        keywords: ['each leg', 'per leg', 'one leg', 'spinning', 'keep turning'],
        answer: `Each leg takes ${about(asm.perLeg.spin.medianSec)} of turning. Keep going until it sits flat.`,
      },
      {
        keywords: ['reach', 'awkward', 'far side', 'other side', 'turn the table'],
        answer: `Turn the tabletop on the cardboard so the next corner is in front of you. ${asm.pctRotatedTable}% of people do.`,
      },
    ],
  })

  // Steps: brackets, one long side at a time --------------------------------------------
  // Brackets sit on the inner face of each leg, just under the shelf (upright frame), so the
  // shelf rests on them. In the local frame (legs up) "up" is 450 - y and z is mirrored.
  const bracketY = H - (shelfY - SHELF_T / 2 - BR[1] / 2)
  const bracketSpot = (i) => [corners[i][0], bracketY, Math.sign(corners[i][1]) * (D / 2 - LEG - BR[2] / 2)]

  const bracketStep = (stepId, title, pair, deg, intro) => {
    const tipMoves = tip(deg)
    pair.forEach((i, k) => {
      const ground = bodyBox()
      enter(brackets[i], 'bracket', { pos: [ground.centre.x - 60 + 120 * k, BR[1] / 2, ground.max.z + 160] })
      attach(brackets[i], bracketSpot(i), [0, 0, 0], BR)
    })
    const spots = pair.map((i) => worldPose(brackets[i]))
    const mid = spots[0].pos.map((v, j) => (v + spots[1].pos[j]) / 2)
    steps.push({
      id: stepId,
      title,
      instruction:
        `${intro} On each of the two legs at the bottom, hook the metal guide (120938) over the leg end and press the awl through both guide holes to mark. ` +
        'Then screw an angle bracket (120298) on at the marks with a longer screw (108530).',
      durationSec: 6,
      camera: camAt(mid, [500, 650, 950]),
      moves: [
        ...tipMoves,
        ...pair.map((i, k) => ({ instance: brackets[i], to: spots[k], start: 0.78 + 0.08 * k, end: 0.92 + 0.08 * k })),
      ],
      active: pair.flatMap((i) => [legs[i], brackets[i]]),
      arrows: spots.map((s) => ({ from: [s.pos[0], s.pos[1] + 170, s.pos[2]], to: [s.pos[0], s.pos[1] + 60, s.pos[2]] })),
      tray: [
        { part: 'guide', count: 1 },
        { part: 'bracket', count: 2 },
        { part: 'screwLong', count: 2 },
      ],
      warning: 'Use the LONGER screws (108530) for the brackets. The shorter ones (109041) are for the shelf.',
      checklist: ['Both legs at the bottom have a bracket', 'Each bracket sits at the marks from the guide'],
      faq: [
        { keywords: ['which screw', 'screw', 'long', 'short'], answer: 'The longer screws, 108530. Keep the 4 shorter ones (109041) for the shelf.' },
        { keywords: ['guide', 'metal', 'template', 'mark', 'where'], answer: 'Hook the metal guide over the end of the leg, on the face pointing up, and press the awl through its holes. Screw the bracket on at those marks.' },
        { keywords: ['tool', 'awl', 'screwdriver', 'drill'], answer: 'An awl to mark, and a Phillips (cross-head) screwdriver. No drill needed.' },
        { keywords: ['side', 'tip', 'lay', 'over'], answer: 'Lay the table on one long side, legs pointing sideways, on the cardboard.' },
      ],
    })
  }
  bracketStep('brackets-a', 'Brackets on the first side', [2, 3], 90, 'Lay the table on one long side.')
  bracketStep('brackets-b', 'Brackets on the other side', [0, 1], 180, 'Turn the table over onto the other long side.')

  // Step: stand it up -------------------------------------------------------------------
  const upright = tip(-90)
  steps.push({
    id: 'flip-upright',
    title: 'Stand it up',
    instruction: 'Lift the table and stand it on its legs. Lift rather than drag so no leg gets pulled sideways.',
    durationSec: 4.5,
    camera: bodyCam([L * 1.0, 900, D + 1300]),
    moves: upright,
    active: ['top', ...legs],
    showFinishedFace: true,
    tray: [],
    warning: 'Lift, don’t drag. Dragging can snap a leg off its screw.',
    checklist: ['Table stands on all 4 legs', 'The brackets face each other under the top'],
    faq: [
      { keywords: ['heavy', 'alone', 'help', 'lift'], answer: 'Hold two legs, lift, and tip it over onto the other two. A helper makes it easier.' },
      { keywords: ['wobble', 'uneven', 'rock'], answer: 'Tip it back and turn the short leg until it sits flat against the top.' },
    ],
  })

  // Step: shelf in ------------------------------------------------------------------------
  enter('shelf', 'shelf', { pos: [0, SHELF_T / 2, D / 2 + shelfSize[2] / 2 + 140], rot: [0, 0, 0] })
  attach('shelf', [0, H - shelfY, 0], [180, 0, 0], shelfSize)
  const shelfEnd = worldPose('shelf')
  steps.push({
    id: 'shelf-in',
    title: 'Slide the shelf in',
    instruction: 'Slide the shelf in from one end, between the legs, so it rests on the 4 brackets.',
    durationSec: 5,
    camera: bodyCam([L * 1.1, 700, D + 1100]),
    moves: [
      { instance: 'shelf', to: { pos: [L + 120, shelfEnd.pos[1], shelfEnd.pos[2]], rot: shelfEnd.rot }, start: 0, end: 0.4 },
      { instance: 'shelf', to: shelfEnd, start: 0.45, end: 1 },
    ],
    active: ['shelf'],
    arrows: [{ from: [L + 50, shelfEnd.pos[1] + 80, 0], to: [L / 2 + 80, shelfEnd.pos[1] + 80, 0] }],
    tray: [{ part: 'shelf', count: 1 }],
    checklist: ['The shelf rests on all 4 brackets'],
    faq: [
      { keywords: ['fit', 'stuck', 'tight'], answer: 'Keep the shelf level and centred between the legs. If it catches, check that every bracket sits at its marks.' },
      { keywords: ['which side', 'up', 'down'], answer: 'Either side up is fine for the shelf.' },
    ],
  })

  // Step: shelf screws ------------------------------------------------------------------
  // Up through each bracket into the underside of the shelf.
  const screwY = H - (shelfY - SHELF_T / 2)
  corners.forEach((_, i) => {
    const spot = bracketSpot(i)
    enter(shelfScrews[i], 'screwShort', { pos: [-45 + 30 * i, 2, D / 2 + 200], rot: [0, 0, 90] })
    attach(shelfScrews[i], [spot[0], screwY, spot[2]], [0, 0, 0], parts.screwShort.size)
  })
  steps.push({
    id: 'shelf-screws',
    title: 'Screw the shelf to the brackets',
    instruction: 'Fix the shelf to each of the 4 brackets with a shorter screw (109041). Use a Phillips screwdriver.',
    durationSec: 5,
    camera: camAt(worldPose('sscrew2').pos, [520, -100, 820]), // from below, to see the screws under the shelf
    moves: shelfScrews.map((s, i) => ({ instance: s, to: worldPose(s), start: 0.15 * i, end: 0.15 * i + 0.4, spin: 3 })),
    active: [...shelfScrews, ...brackets],
    tray: [{ part: 'screwShort', count: 4 }],
    warning: 'Shorter screws (109041) here. A long screw can come through the top of the shelf.',
    checklist: ['All 4 brackets are screwed to the shelf', 'The shelf does not slide when pushed'],
    faq: [
      { keywords: ['which screw', 'screw', 'short', 'long'], answer: 'The 4 shorter screws, 109041. The longer ones went into the brackets.' },
      { keywords: ['tool', 'screwdriver'], answer: 'A Phillips (cross-head) screwdriver.' },
      { keywords: ['done', 'finished', 'next'], answer: wall ? 'One more step: fix it to the wall.' : `That was the last step. Your ${name} is done.` },
    ],
  })

  // Step (TV bench): wall anchor --------------------------------------------------------
  if (wall) {
    const fit = worldPose('fitting')
    steps.push({
      id: 'wall-anchor',
      title: 'Fix it to the wall',
      instruction:
        'Push the bench against the wall. Mark the wall through the hole in the wall fitting, then fix the wall hook (103693) with a screw and plug suited to your wall. ' +
        'Hook the fitting on and push on the cover (115754).',
      durationSec: 4,
      camera: camAt(fit.pos, [700, 350, 1100]),
      moves: [],
      active: ['fitting'],
      arrows: [{ from: [fit.pos[0], fit.pos[1], fit.pos[2] + 260], to: [fit.pos[0], fit.pos[1], fit.pos[2] + 60] }],
      tray: [{ part: 'hook', count: 1 }, { part: 'cover', count: 1 }],
      warning: 'Always fix it to the wall: a TV on top can tip it over. Wall screws and plugs are not included.',
      checklist: ['The fitting is hooked onto the wall hook', 'The cover is on'],
      faq: [
        { keywords: ['screw', 'plug', 'wall', 'included', 'drill'], answer: 'Wall screws and plugs are not in the box. Pick ones that suit your wall, and ask at a hardware store if unsure.' },
        { keywords: ['why', 'need', 'skip'], answer: 'Furniture with a TV on it can tip over and cause serious injury. The wall fitting stops that.' },
        { keywords: ['done', 'finished', 'next'], answer: `That was the last step. Your ${name} is done.` },
      ],
    })
  }

  return mergeAsm({ product: { id, name, dims }, parts, instances, steps }, asm)
}

const products = [
  // Shelf height (209 mm) measured from the LACK coffee table model in IKEA-Manual.
  { id: 'lack-coffee', name: 'LACK coffee table', dims: '900 × 550 × 450 mm', L: 900, D: 550, shelfY: 209, asm: coffeeAsm, wall: false },
  { id: 'lack-tv', name: 'LACK TV bench', dims: '900 × 260 × 450 mm', L: 900, D: 260, shelfY: 209, asm: tvAsm, wall: true },
]

for (const spec of products) {
  const data = build(spec)
  data.sources.push({
    name: 'IKEA-Manual (Wang et al., NeurIPS 2022)',
    url: 'https://arxiv.org/abs/2302.01881',
    license: 'see dataset',
    note: 'Shelf height from the LACK coffee table part model.',
  })
  writeFileSync(new URL(`../src/data/${spec.id}.json`, import.meta.url), JSON.stringify(data, null, 2) + '\n')
  console.log(`wrote src/data/${spec.id}.json (${data.steps.length} steps)`)
}

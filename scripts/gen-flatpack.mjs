// Simplified step guides for common box-built IKEA products, from their outside measurements:
// KALLAX shelving, BILLY bookcases, EKET cabinets and LINNMON/ADILS desks, in several sizes.
// Writes public/products/fp-*.json (fetched on demand) and src/data/catalog-flatpack.json.
//
//   node scripts/gen-flatpack.mjs
//
// Panels are plain boxes at the product's nominal size; panel thicknesses are estimates. Dowels,
// cam locks, nails and shelf pins aren't modelled, and the build order is a generic one, not
// IKEA's manual, so every step points at the paper manual for fittings.
//
// Cases (shelves, cabinets) are built lying on their front, the way the paper manuals do it, then
// stood up with one rigid turn about the bottom-front edge. Desks are built upside down and flipped.
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = new URL('../public/products/', import.meta.url)
const r1 = (x) => Math.round(x * 10) / 10 + 0
const WHITE = '#fbfaf6'
const cm = (mm) => Math.round(mm / 10)
const NOTE = 'Simplified guide: dowels, cam locks, nails and screws aren’t shown. Your paper manual shows which to use.'

/** Camera looking at `target` from direction `dir`, far enough to fit a sphere of `radius`. */
function cam(target, radius, dir) {
  const l = Math.hypot(...dir)
  return { position: dir.map((d, k) => r1(target[k] + (d / l) * radius * 3)), target: target.map(r1) }
}

function fittingFaq(name) {
  return [
    {
      keywords: ['which screw', 'screw', 'screws', 'dowel', 'cam', 'nail', 'pin', 'hardware', 'fitting', 'allen'],
      answer: `This simplified guide for the ${name} doesn’t show fittings. Your paper manual shows which ones each step uses.`,
    },
    {
      keywords: ['size', 'scale', 'big', 'real', 'measure'],
      answer: `The outside size matches IKEA’s listed size for the ${name}. Panel thicknesses are estimates.`,
    },
    {
      keywords: ['order', 'manual', 'different', 'same'],
      answer: 'This guide uses a generic build order. If your paper manual does it differently, follow the manual.',
    },
  ]
}

/**
 * A case (shelf unit, cabinet), described standing: x width, y up from the floor, z towards the
 * front, centred on x/z. Each piece is { id, part, pos }. Groups are build steps while it lies on
 * its front; `after` steps happen once it stands.
 */
function caseGuide({ id, name, category, dims, W, H, D, parts, pieces, groups, after = [] }) {
  // Lying on its front: front on the floor, top towards +z, bottom-front edge at z = D/2.
  const lie = ([x, y, z]) => [r1(x), r1(D / 2 - z), r1(D / 2 + y)]
  const at = new Map(pieces.map((p) => [p.id, p]))
  const lyingCentre = [0, D / 2, D / 2 + H / 2]
  const push = 0.3 * Math.max(W, H) + 150

  // Parts wait around the build, each pushed out from the centre (lying parts) or stacked to
  // the right, flat on the floor (parts added after it stands).
  const later = new Set(after.flatMap((g) => g.ids))
  let stack = 0
  const instances = pieces.map((p, i) => {
    if (later.has(p.id)) {
      const size = parts[p.part].size
      const pos = [r1(W / 2 + 250 + size[0] / 2), r1(size[1] / 2 + stack), 0]
      stack += size[1] + 6
      return { id: p.id, part: p.part, initial: { pos }, enterStep: 0 }
    }
    const c = lie(p.pos)
    let dx = c[0] - lyingCentre[0]
    let dz = c[2] - lyingCentre[2]
    const len = Math.hypot(dx, dz)
    if (len < 40) {
      const ang = (i / pieces.length) * Math.PI * 2 + 0.6
      ;[dx, dz] = [Math.cos(ang), Math.sin(ang)]
    } else {
      ;[dx, dz] = [dx / len, dz / len]
    }
    return { id: p.id, part: p.part, initial: { pos: [r1(c[0] + dx * push), c[1], r1(c[2] + dz * push)], rot: [90, 0, 0] }, enterStep: 0 }
  })

  const lyingCam = cam(lyingCentre, 1.3 * (0.5 * Math.max(W, H) + push), [0.55, 1.1, 0.7])
  const standCam = cam([0, H * 0.45, 0], 0.5 * Math.hypot(W, H, D) + 250, [0.6, 0.4, 1])
  const turnCam = cam([0, H * 0.45, H * 0.3], 0.5 * Math.hypot(W, H * 1.4) + 150, [1, 0.45, 0.5])

  const slide = (ids, toPose) =>
    ids.map((pid, i) => {
      const start = ids.length > 1 ? Math.min(0.55, (0.5 * i) / (ids.length - 1)) : 0.1
      return { instance: pid, to: toPose(pid), start: r1(start * 100) / 100, end: Math.min(1, r1((start + 0.45) * 100) / 100) }
    })
  const tray = (ids) => {
    const counts = new Map()
    for (const pid of ids) counts.set(at.get(pid).part, (counts.get(at.get(pid).part) ?? 0) + 1)
    return [...counts].map(([part, count]) => ({ part, count }))
  }

  const built = []
  const steps = groups.map((g, si) => {
    built.push(...g.ids)
    return {
      id: `step-${si + 1}`,
      title: g.title,
      instruction: g.instruction,
      durationSec: r1(Math.min(7, 2.5 + 0.5 * g.ids.length)),
      camera: lyingCam,
      moves: slide(g.ids, (pid) => ({ pos: lie(at.get(pid).pos), rot: [90, 0, 0] })),
      active: g.ids,
      tray: tray(g.ids),
      warning: g.warning,
      checklist: g.checklist,
      faq: fittingFaq(name),
    }
  })

  steps.push({
    id: 'stand-up',
    title: 'Stand it up',
    instruction: `Get a second person to help. Tip the ${name} up onto its bottom edge, as the animation shows.`,
    durationSec: 4,
    camera: turnCam,
    // About the bottom-front edge, which stays on the floor; it ends standing, centred.
    moves: [{ kind: 'rigid', group: built, pivot: [0, 0, r1(D / 2)], rotate: [-90, 0, 0] }],
    active: built,
    tray: [],
    warning: 'Fix it to the wall with the wall fitting before you use it. Furniture that tips over can injure people.',
    checklist: ['It stands level on all corners', 'It is fixed to the wall'],
    faq: [
      {
        keywords: ['wall', 'tip', 'anchor', 'fix', 'plug'],
        answer: 'The wall fitting is included, but the wall plugs and screws depend on your wall. Ask a hardware shop which ones suit it.',
      },
      ...fittingFaq(name),
    ],
  })

  after.forEach((g, i) => {
    steps.push({
      id: `after-${i + 1}`,
      title: g.title,
      instruction: g.instruction,
      durationSec: r1(Math.min(7, 2.5 + 0.5 * g.ids.length)),
      camera: standCam,
      moves: slide(g.ids, (pid) => ({ pos: at.get(pid).pos.map(r1), rot: [0, 0, 0] })),
      active: g.ids,
      tray: tray(g.ids),
      warning: g.warning,
      checklist: g.checklist,
      faq: fittingFaq(name),
    })
  })

  return { product: { id, name, dims, category, note: NOTE }, parts, instances, steps, sources: [] }
}

const box = (name, size) => ({ name, shape: 'box', size: size.map(r1), color: WHITE })

// ---- KALLAX: cells 33.5 cm, 39 mm outer frame, 16 mm inner dividers, 39 cm deep -------------
function kallax(cols, rows) {
  const [cell, to, ti, D] = [335, 39, 16, 390]
  const W = cols * cell + 2 * to + (cols - 1) * ti
  const H = rows * cell + 2 * to + (rows - 1) * ti
  const name = `KALLAX shelving unit ${cols}×${rows}`
  const parts = {
    side: box(`Side panel, ${cm(H)} cm`, [to, H, D]),
    end: box(`Top/bottom panel, ${cm(W - 2 * to)} cm`, [W - 2 * to, to, D]),
  }
  if (cols > 1) parts.divider = box(`Long divider, ${cm(H - 2 * to)} cm`, [ti, H - 2 * to, D])
  if (rows > 1) parts.shelf = box(`Short shelf, ${cm(cell)} cm`, [cell, ti, D])

  const pieces = [
    { id: 'bottom', part: 'end', pos: [0, to / 2, 0] },
    { id: 'top', part: 'end', pos: [0, H - to / 2, 0] },
    { id: 'left', part: 'side', pos: [-(W - to) / 2, H / 2, 0] },
    { id: 'right', part: 'side', pos: [(W - to) / 2, H / 2, 0] },
  ]
  const dividers = []
  for (let j = 1; j < cols; j++) {
    const x = -W / 2 + to + j * cell + (j - 1) * ti + ti / 2
    dividers.push(`div${j}`)
    pieces.push({ id: `div${j}`, part: 'divider', pos: [x, H / 2, 0] })
  }
  const rowsOf = []
  for (let i = 1; i < rows; i++) {
    const y = to + i * cell + (i - 1) * ti + ti / 2
    const row = []
    for (let j = 0; j < cols; j++) {
      const id = `shelf${i}-${j + 1}`
      row.push(id)
      pieces.push({ id, part: 'shelf', pos: [-W / 2 + to + j * (cell + ti) + cell / 2, y, 0] })
    }
    rowsOf.push(row)
  }

  const groups = [
    dividers.length
      ? {
          ids: ['bottom', ...dividers],
          title: 'Bottom and long dividers',
          instruction: `Lay the bottom panel on its front edge. Push the ${dividers.length === 1 ? 'long divider' : `${dividers.length} long dividers`} onto its dowels.`,
          checklist: ['The dividers stand straight up from the bottom panel'],
        }
      : {
          ids: ['bottom'],
          title: 'Bottom panel',
          instruction: 'Lay the bottom panel on its front edge, on a soft surface such as the cardboard.',
          checklist: ['The bottom panel lies on its front edge'],
        },
  ]
  // Short shelves, two rows per step.
  for (let i = 0; i < rowsOf.length; i += 2) {
    const ids = rowsOf.slice(i, i + 2).flat()
    const last = Math.min(i + 2, rowsOf.length)
    const label = rowsOf.length > 2 ? ` (row${last > i + 1 ? `s ${i + 1}–${last}` : ` ${i + 1}`})` : ''
    groups.push({
      ids,
      title: `Short shelves${label}`,
      instruction: `Slide the ${ids.length === 1 ? 'short shelf' : `${ids.length} short shelves`} in ${cols > 1 ? 'between the dividers' : 'from the bottom up'}. Their dowel holes face the sides.`,
      checklist: [`${ids.length === 1 ? 'The shelf is' : 'All shelves are'} level with the ones beside ${ids.length === 1 ? 'it' : 'them'}`],
    })
  }
  groups.push(
    {
      ids: ['top'],
      title: 'Top panel',
      instruction: 'Push the top panel onto the dowels at the other end of the dividers.',
      checklist: ['The top panel is on, flush at both ends'],
    },
    {
      ids: ['left', 'right'],
      title: 'Both side panels',
      instruction: 'Fit both side panels and tighten the cam locks a quarter turn, until they stop.',
      checklist: ['Both sides are on', 'Every cam lock is tight'],
    },
  )
  return caseGuide({
    id: `fp-kallax-${cols}x${rows}`,
    name,
    category: 'Shelf',
    dims: `${cm(W)} × ${cm(D)} × ${cm(H)} cm`,
    W,
    H,
    D,
    parts,
    pieces,
    groups,
  })
}

// ---- BILLY: 15 mm panels, 28 cm deep including a 3 mm back panel, plinth at the bottom ------
function billy(width, height) {
  const [t, D, plinth] = [15, 280, 60]
  const W = width
  const H = height
  const Dc = D - 3 // carcass; the back panel sits behind it
  const zc = 1.5
  const name = `BILLY bookcase ${cm(W)}×${cm(H)}`
  const tall = H > 1500
  const parts = {
    side: box(`Side panel, ${cm(H)} cm`, [t, H, Dc]),
    end: box(`Top/bottom, ${cm(W - 2 * t)} cm`, [W - 2 * t, t, Dc]),
    plinth: box(`Plinth, ${cm(W - 2 * t)} cm`, [W - 2 * t, plinth, t]),
    back: box(`Back panel (hardboard), ${cm(H)} cm`, [W - 4, H - 4, 3]),
    shelf: box(`Shelf, ${cm(W - 2 * t - 4)} cm`, [W - 2 * t - 4, t, Dc - 20]),
  }
  const fixedY = r1(H * 0.42)
  const pieces = [
    { id: 'bottom', part: 'end', pos: [0, plinth + t / 2, zc] },
    { id: 'plinth', part: 'plinth', pos: [0, plinth / 2, D / 2 - 20 - t / 2] },
    { id: 'top', part: 'end', pos: [0, H - t / 2, zc] },
    { id: 'left', part: 'side', pos: [-(W - t) / 2, H / 2, zc] },
    { id: 'right', part: 'side', pos: [(W - t) / 2, H / 2, zc] },
    { id: 'back', part: 'back', pos: [0, H / 2, -D / 2 + 1.5] },
  ]
  if (tall) pieces.push({ id: 'fixed', part: 'end', pos: [0, fixedY, zc] })
  const shelfYs = tall ? [r1((plinth + t + fixedY) / 2), r1(fixedY + (H - fixedY) / 3), r1(fixedY + (2 * (H - fixedY)) / 3)] : [r1(H * 0.37), r1(H * 0.68)]
  const shelves = shelfYs.map((y, i) => {
    pieces.push({ id: `shelf${i + 1}`, part: 'shelf', pos: [0, y, zc + 8] })
    return `shelf${i + 1}`
  })

  const groups = [
    {
      ids: ['bottom', 'plinth'],
      title: 'Bottom and plinth',
      instruction: 'Lay the bottom shelf on its front edge and fix the plinth under its front.',
      checklist: ['The plinth is under the front of the bottom shelf'],
    },
    ...(tall
      ? [
          {
            ids: ['fixed'],
            title: 'Fixed middle shelf',
            instruction: 'Set the fixed shelf in line, a little below the middle. It holds the sides together.',
            checklist: ['The fixed shelf lines up with the cam lock holes in the sides'],
          },
        ]
      : []),
    {
      ids: ['top'],
      title: 'Top',
      instruction: 'Set the top at the other end, in line with the bottom.',
      checklist: ['The top lines up with the bottom'],
    },
    {
      ids: ['left', 'right'],
      title: 'Both side panels',
      instruction: 'Fit both side panels onto the dowels and turn every cam lock until it stops.',
      checklist: ['Both sides are on', 'Every cam lock is tight'],
    },
    {
      ids: ['back'],
      title: 'Back panel',
      instruction: 'Lay the back panel on, smooth side down. Check it is square, then nail it all round.',
      warning: 'Measure both diagonals before nailing. If they match, the bookcase is square.',
      checklist: ['Both diagonals measure the same', 'The back is nailed all round'],
    },
  ]
  const after = [
    {
      ids: shelves,
      title: 'Adjustable shelves',
      instruction: `Push 4 shelf pins into the holes at the height you want, then lay each of the ${shelves.length} shelves on them.`,
      warning: 'Shelf pins aren’t shown. Put all 4 pins at the same height, or the shelf will rock.',
      checklist: ['Every shelf sits flat on 4 pins'],
    },
  ]
  return caseGuide({
    id: `fp-billy-${cm(W)}x${cm(H)}`,
    name,
    category: 'Shelf',
    dims: `${cm(W)} × ${cm(D)} × ${cm(H)} cm`,
    W,
    H,
    D,
    parts,
    pieces,
    groups,
    after,
  })
}

// ---- EKET: 35 cm cubes side by side, 18 mm panels, 3 mm back -------------------------------
function eket(cells) {
  const [t, D] = [18, 350]
  const W = cells * 350
  const H = 350
  const Dc = D - 3
  const zc = 1.5
  const name = cells === 1 ? 'EKET cabinet 35×35' : `EKET cabinet ${cm(W)}×35 (${cells} compartments)`
  const inner = (W - 2 * t - (cells - 1) * t) / cells
  const parts = {
    side: box(`Side, ${cm(H)} cm`, [t, H, Dc]),
    end: box(`Top/bottom, ${cm(W - 2 * t)} cm`, [W - 2 * t, t, Dc]),
    back: box(`Back panel, ${cm(W)} cm`, [W - 4, H - 4, 3]),
  }
  if (cells > 1) parts.divider = box(`Divider, ${cm(H - 2 * t)} cm`, [t, H - 2 * t, Dc])
  const pieces = [
    { id: 'bottom', part: 'end', pos: [0, t / 2, zc] },
    { id: 'top', part: 'end', pos: [0, H - t / 2, zc] },
    { id: 'left', part: 'side', pos: [-(W - t) / 2, H / 2, zc] },
    { id: 'right', part: 'side', pos: [(W - t) / 2, H / 2, zc] },
    { id: 'back', part: 'back', pos: [0, H / 2, -D / 2 + 1.5] },
  ]
  const dividers = []
  for (let j = 1; j < cells; j++) {
    dividers.push(`div${j}`)
    pieces.push({ id: `div${j}`, part: 'divider', pos: [-W / 2 + t + j * inner + (j - 1) * t + t / 2, H / 2, zc] })
  }
  const groups = [
    {
      ids: ['bottom', ...dividers],
      title: dividers.length ? 'Bottom and dividers' : 'Bottom',
      instruction: dividers.length
        ? `Lay the bottom on its front edge and push the ${dividers.length === 1 ? 'divider' : `${dividers.length} dividers`} onto its dowels.`
        : 'Lay the bottom on its front edge, on a soft surface such as the cardboard.',
      checklist: [dividers.length ? 'The dividers stand straight up' : 'The bottom lies on its front edge'],
    },
    {
      ids: ['top'],
      title: 'Top',
      instruction: 'Push the top onto the other end.',
      checklist: ['The top is on, flush at both ends'],
    },
    {
      ids: ['left', 'right'],
      title: 'Both sides',
      instruction: 'Fit both sides and tighten the cam locks until they stop.',
      checklist: ['Both sides are on', 'Every cam lock is tight'],
    },
    {
      ids: ['back'],
      title: 'Back panel',
      instruction: 'Lay the back panel on, check the cabinet is square, then fix the back all round.',
      checklist: ['Both diagonals measure the same', 'The back is fixed all round'],
    },
  ]
  return caseGuide({
    id: `fp-eket-${cm(W)}x35`,
    name,
    category: 'Cabinet',
    dims: `${cm(W)} × 35 × 35 cm`,
    W,
    H,
    D,
    parts,
    pieces,
    groups,
  })
}

// ---- LINNMON tabletop on 4 ADILS legs: built upside down, then flipped ---------------------
function linnmon(width, depth) {
  const [t, L, dia, inset] = [34, 700, 40, 60]
  const T = t + L // 73.4 cm tall
  const name = `LINNMON / ADILS desk ${cm(width)}×${cm(depth)}`
  const parts = {
    top: box(`Tabletop, ${cm(width)}×${cm(depth)} cm`, [width, t, depth]),
    leg: { name: 'ADILS leg, 70 cm', shape: 'cylinder', size: [dia, L, dia], color: WHITE },
  }
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => [r1(sx * (width / 2 - inset)), r1(sz * (depth / 2 - inset))])
  const instances = [
    { id: 'top', part: 'top', initial: { pos: [0, t / 2, 0], rot: [180, 0, 0] }, enterStep: 0 },
    // Legs lie on the floor in front of the top, pointing away from it.
    ...corners.map((_, i) => ({
      id: `leg${i + 1}`,
      part: 'leg',
      initial: { pos: [r1(-150 + 100 * i), dia / 2, r1(depth / 2 + 120 + L / 2)], rot: [90, 0, 0] },
      enterStep: 0,
    })),
  ]
  // Upside down, like the top, so both end upright after the flip.
  const legUp = (i) => ({ pos: [corners[i][0], r1(t + L / 2), corners[i][1]], rot: [180, 0, 0] })
  const camUpside = cam([0, T * 0.35, depth * 0.2], 0.5 * Math.hypot(width, depth + 400, T), [0.5, 0.85, 1])
  const legs = (a, b) => ({
    title: a === 0 ? 'First two legs' : 'Last two legs',
    instruction:
      a === 0
        ? 'Lay the tabletop upside down on the cardboard. Screw two legs into the pre-drilled holes, hand tight.'
        : 'Screw in the other two legs the same way.',
    durationSec: 5,
    camera: camUpside,
    // Raise each leg upright above its hole (high enough to clear the floor while it turns), then screw it in.
    moves: [a, b].flatMap((i, k) => [
      { instance: `leg${i + 1}`, to: { ...legUp(i), pos: [corners[i][0], r1(t + L / 2 + 300), corners[i][1]] }, start: k * 0.3, end: k * 0.3 + 0.3 },
      { instance: `leg${i + 1}`, to: legUp(i), start: k * 0.3 + 0.3, end: k * 0.3 + 0.7, spin: 4 },
    ]),
    active: [`leg${a + 1}`, `leg${b + 1}`],
    tray: [{ part: 'leg', count: 2 }],
    warning: 'Hand tight only. Forcing a leg can strip the hole in the tabletop.',
    checklist: ['Both legs are screwed in straight and tight'],
    faq: fittingFaq(name),
  })
  // Flip: lift clear of the floor, turn about the lifted centre, set down.
  const radius = Math.hypot(T / 2, depth / 2)
  const lift = r1(radius - T / 2 + 20)
  const group = ['top', 'leg1', 'leg2', 'leg3', 'leg4']
  const steps = [
    legs(0, 1),
    legs(2, 3),
    {
      id: 'flip',
      title: 'Turn it over',
      instruction: 'With a second person, lift the desk and turn it onto its legs. Don’t drag it by the legs.',
      durationSec: 4,
      camera: cam([0, T * 0.5, 0], 0.5 * Math.hypot(width, depth, T) + 200, [0.7, 0.45, 1]),
      moves: [
        { kind: 'rigid', group, translate: [0, lift, 0], start: 0, end: 0.25 },
        { kind: 'rigid', group, pivot: [0, r1(T / 2 + lift), 0], rotate: [180, 0, 0], start: 0.25, end: 0.8 },
        { kind: 'rigid', group, translate: [0, -lift, 0], start: 0.8, end: 1 },
      ],
      active: group,
      tray: [],
      checklist: ['The desk stands level on all four legs'],
      faq: fittingFaq(name),
    },
  ].map((s, i) => ({ id: s.id ?? `step-${i + 1}`, ...s }))
  return {
    product: { id: `fp-linnmon-${cm(width)}x${cm(depth)}`, name, dims: `${cm(width)} × ${cm(depth)} × ${cm(T)} cm`, category: 'Desk', note: NOTE },
    parts,
    instances,
    steps,
    sources: [],
  }
}

const guides = [
  kallax(1, 2),
  kallax(1, 4),
  kallax(2, 2),
  kallax(2, 4),
  kallax(4, 2),
  kallax(4, 4),
  kallax(5, 5),
  billy(400, 1060),
  billy(400, 2020),
  billy(800, 1060),
  billy(800, 2020),
  eket(1),
  eket(2),
  eket(3),
  linnmon(1000, 600),
  linnmon(1200, 600),
  linnmon(1500, 750),
]

mkdirSync(OUT, { recursive: true })
const catalog = guides.map((g) => {
  writeFileSync(new URL(`${g.product.id}.json`, OUT), JSON.stringify(g))
  return { id: g.product.id, name: g.product.name, category: g.product.category, steps: g.steps.length, timed: false }
})
writeFileSync(new URL('../src/data/catalog-flatpack.json', import.meta.url), JSON.stringify(catalog, null, 1) + '\n')
console.log(`wrote ${catalog.length} simplified guides to public/products/`)

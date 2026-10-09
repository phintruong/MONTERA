// Generates src/data/lack.json. Tune poses here (or edit the JSON directly).
// Real-world timings come from src/data/asm/lack.json (node scripts/asm-stats.mjs).
import { writeFileSync } from 'node:fs'
import asm from '../src/data/asm/lack.json' with { type: 'json' }
import { about, mergeAsm } from './lib/asm.mjs'

const rowX = [-330, -110, 110, 330]
const corners = [[-250, -250], [250, -250], [-250, 250], [250, 250]]
const ROW_Z = 520
const legs = [0, 1, 2, 3].map((i) => `leg${i + 1}`)
const screws = [0, 1, 2, 3].map((i) => `screw${i + 1}`)
const assembled = ['top', ...legs, ...screws]

const data = {
  product: { id: 'lack', name: 'LACK side table', dims: '550 × 550 × 450 mm' },
  parts: {
    cardboard: { name: 'Cardboard (from the box)', shape: 'box', size: [760, 4, 760], color: '#dcc093' },
    top: {
      name: 'Tabletop', shape: 'box', size: [550, 50, 550], color: '#fbfaf6',
      finishedFace: '+y', finishedLabel: 'Glossy side',
    },
    leg: { name: 'Leg', shape: 'box', size: [50, 400, 50], color: '#fbfaf6' },
    screw: { name: 'Double-ended screw', shape: 'screw', size: [8, 40, 8], color: '#9a9fa5', hardware: true },
  },
  instances: [
    { id: 'cardboard', part: 'cardboard', initial: { pos: [0, -2, 0] }, enterStep: 0 },
    { id: 'top', part: 'top', initial: { pos: [0, 320, 0], rot: [0, 0, 0] }, enterStep: 0 },
    ...legs.map((id, i) => ({ id, part: 'leg', initial: { pos: [rowX[i], 200, ROW_Z] }, enterStep: 1 })),
    ...screws.map((id, i) => ({ id, part: 'screw', initial: { pos: [rowX[i], 620, ROW_Z] }, enterStep: 1 })),
  ],
  steps: [
    {
      id: 'top-down',
      title: 'Tabletop glossy side down',
      instruction:
        'Lay the cardboard flat. Put the tabletop on it with the glossy side facing down, so the four pre-drilled holes face up.',
      durationSec: 3.5,
      camera: { position: [750, 650, 950], target: [0, 60, 0] },
      moves: [{ instance: 'top', to: { pos: [0, 25, 0], rot: [180, 0, 0] } }],
      active: ['top'],
      // Both hands flat on the hole side (local -y), fingers reaching in from opposite edges:
      // under the board while lifting, on top after the flip.
      hands: [
        { side: 'right', follow: 'top', mode: 'local', offset: [300, -45, 0], rot: [180, 90, 0], pose: 'flat' },
        { side: 'left', follow: 'top', mode: 'local', offset: [-300, -45, 0], rot: [180, -90, 0], pose: 'flat' },
      ],
      showFinishedFace: true,
      arrows: [{ from: [0, 260, 0], to: [0, 90, 0] }],
      tray: [{ part: 'top', count: 1 }, { part: 'cardboard', count: 1 }],
      warning: 'Glossy side DOWN. If you can see the shiny surface, flip it. The holes must face you.',
      checklist: ['Tabletop is on the cardboard, glossy side down', 'I can see the 4 corner holes'],
      faq: [
        { keywords: ['which side', 'which way', 'up', 'down', 'glossy', 'shiny', 'flip'], answer: 'Glossy side down on the cardboard. The side with the four holes faces up toward you.' },
        { keywords: ['cardboard', 'floor', 'scratch'], answer: 'Use the flattened box as a mat so the glossy top does not get scratched.' },
        { keywords: ['hole', 'holes'], answer: 'There is one pre-drilled hole near each corner. They are on the plain side, which should face up.' },
      ],
    },
    {
      id: 'screws-into-legs',
      title: 'Screws into the legs',
      instruction:
        'Take the 4 double-ended screws. Screw one halfway into the hole at the end of each leg, by hand, until about 20 mm sticks out.',
      durationSec: 5,
      camera: { position: [650, 950, 1950], target: [0, 280, 420] },
      moves: screws.map((id, i) => ({
        instance: id, to: { pos: [rowX[i], 400, ROW_Z] }, start: 0.12 * i, end: 0.12 * i + 0.55, spin: 4,
      })),
      active: [...legs, ...screws],
      // Left hand steadies the leg, right hand pinches and twists the screw.
      hands: [
        { side: 'right', follow: 'screw1', offset: [0, 45, 95], rot: [0, 0, 0], pose: 'pinch', twist: 40 },
        { side: 'left', follow: 'leg1', offset: [-60, 110, 0], rot: [0, 0, 90], pose: 'grip' },
      ],
      arrows: rowX.map((x) => ({ from: [x, 760, ROW_Z], to: [x, 680, ROW_Z] })),
      tray: [{ part: 'leg', count: 4 }, { part: 'screw', count: 4 }],
      checklist: ['All 4 legs have a screw in one end', 'About 20 mm of screw sticks out of each leg'],
      faq: [
        { keywords: ['which screw', 'screw', 'screws', 'bolt', 'hardware'], answer: 'There is only one kind: the double-ended screw, threaded at both ends. Use all four, one per leg.' },
        { keywords: ['how far', 'halfway', 'deep', 'tight'], answer: 'Halfway: about 20 mm in and 20 mm sticking out. Hand tight is enough.' },
        { keywords: ['which end', 'end of the leg', 'leg end'], answer: 'Use the end of the leg that has the hole.' },
        { keywords: ['tool', 'screwdriver', 'allen', 'drill'], answer: 'No tools. Turn the screws by hand.' },
      ],
    },
    {
      id: 'legs-onto-top',
      title: 'Screw the legs on',
      instruction:
        'Turn each leg upside down so the screw points at a corner hole. Screw it in clockwise by hand until the leg sits flat against the top.',
      durationSec: 6,
      camera: { position: [1150, 900, 700], target: [0, 180, 0] },
      moves: legs.flatMap((leg, i) => {
        const [cx, cz] = corners[i]
        const s0 = 0.08 * i
        return [
          {
            kind: 'rigid', group: [leg, screws[i]], pivot: [rowX[i], 200, ROW_Z], rotate: [180, 0, 0],
            translate: [cx - rowX[i], 260, cz - ROW_Z], start: s0, end: s0 + 0.4,
          },
          { instance: leg, to: { pos: [cx, 250, cz], rot: [180, 0, 0] }, start: s0 + 0.45, end: s0 + 0.75, spin: 3 },
          { instance: screws[i], to: { pos: [cx, 50, cz], rot: [180, 0, 0] }, start: s0 + 0.45, end: s0 + 0.75, spin: 3 },
        ]
      }),
      active: [...legs, ...screws],
      // Left hand presses the tabletop down, right hand twists the leg in.
      hands: [
        // Right hand twists the leg nearest the camera, from its +x side (palm -x).
        { side: 'right', follow: 'leg4', offset: [75, 120, 0], rot: [0, 0, -90], pose: 'grip', twist: 45 },
        { side: 'left', follow: 'top', offset: [140, 45, -40], rot: [0, 60, 0], pose: 'flat' },
      ],
      arrows: corners.map(([cx, cz]) => ({ from: [cx, 760, cz], to: [cx, 690, cz] })),
      tray: [{ part: 'leg', count: 4 }],
      warning: 'Hand tight only. Forcing it can strip the hole in the tabletop.',
      checklist: ['All 4 legs are screwed in', 'Each leg sits flat against the tabletop, no gap'],
      faq: [
        { keywords: ['which way', 'direction', 'clockwise', 'turn'], answer: 'Clockwise, looking down at the leg, like closing a jar.' },
        { keywords: ['gap', 'wobble', 'loose', 'not flat'], answer: 'Keep turning the leg until it sits flat. If it stops early, unscrew it and screw it back in straight.' },
        { keywords: ['corner', 'which hole', 'where'], answer: 'One leg per corner hole. It does not matter which leg goes where.' },
        { keywords: ['tight', 'strip', 'force'], answer: 'Stop as soon as the leg is flat and firm. Hand tight is enough.' },
        {
          keywords: ['reach', 'awkward', 'far side', 'other side', 'turn the table'],
          answer: `Turn the tabletop on the cardboard so the next corner is in front of you. Most people (${asm.pctRotatedTable}%) do.`,
        },
        {
          keywords: ['each leg', 'per leg', 'one leg', 'spinning', 'keep turning'],
          answer: `Each leg takes ${about(asm.perLeg.spin.medianSec)} of turning. Keep going until it sits flat.`,
        },
      ],
    },
    {
      id: 'flip-upright',
      title: 'Flip it over',
      instruction:
        'Lift the table, turn it over, and stand it on its legs. Lift rather than drag so no leg gets pulled sideways.',
      durationSec: 4.5,
      camera: { position: [1300, 1100, 1500], target: [0, 380, 0] },
      moves: [
        { kind: 'rigid', group: assembled, translate: [0, 400, 0], start: 0, end: 0.25 },
        { kind: 'rigid', group: assembled, pivot: [0, 625, 0], rotate: [180, 0, 0], start: 0.25, end: 0.75 },
        { kind: 'rigid', group: assembled, translate: [0, -400, 0], start: 0.75, end: 1 },
      ],
      active: ['top', ...legs],
      // Hold the two legs on one side and tip the table over.
      hands: [
        { side: 'right', follow: 'leg4', mode: 'local', offset: [75, 40, 0], rot: [0, 0, -90], pose: 'grip' },
        { side: 'left', follow: 'leg2', mode: 'local', offset: [75, 40, 0], rot: [0, 0, -90], pose: 'grip' },
      ],
      showFinishedFace: true,
      tray: [],
      warning: 'Lift, don’t drag. Dragging can snap a leg off its screw.',
      checklist: ['Table stands on all 4 legs', 'It does not wobble'],
      faq: [
        { keywords: ['wobble', 'uneven', 'rock'], answer: 'Flip it back and tighten the short leg until it sits flat, then try again.' },
        { keywords: ['heavy', 'alone', 'help', 'lift'], answer: 'It is light enough to do alone: hold two legs, lift, and tip it over onto the other two.' },
        { keywords: ['done', 'finished', 'next'], answer: 'That was the last step. Your LACK is done.' },
      ],
    },
  ],
}

mergeAsm(data, asm)

writeFileSync(new URL('../src/data/lack.json', import.meta.url), JSON.stringify(data, null, 2) + '\n')
console.log('wrote src/data/lack.json')

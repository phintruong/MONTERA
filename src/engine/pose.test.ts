import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import raw from '../data/lack.json'
import { parseAssembly } from '../data/schema'
import { explode, frameAt, handAt } from './pose'
import { answerFromFaq } from '../ask/faq'
import { parseCommand } from '../voice/commands'

const lack = parseAssembly(raw)
const up = (id: string, step: number, t: number) =>
  new Vector3(0, 1, 0).applyQuaternion(frameAt(lack, step, t).get(id)!.q)

describe('LACK data', () => {
  it('has 4 steps and step 2 tray is leg ×4 + screw ×4', () => {
    expect(lack.steps).toHaveLength(4)
    expect(lack.steps[1].tray).toEqual([
      { part: 'leg', count: 4 },
      { part: 'screw', count: 4 },
    ])
  })
})

describe('frameAt', () => {
  it('is deterministic for the same (step, t)', () => {
    const a = frameAt(lack, 2, 0.37)
    const b = frameAt(lack, 2, 0.37)
    for (const [id, pl] of a) expect(pl.p.distanceTo(b.get(id)!.p)).toBe(0)
  })

  it('step 1 ends with the glossy face pointing down', () => {
    expect(up('top', 0, 0).y).toBeCloseTo(1)
    expect(up('top', 0, 1).y).toBeCloseTo(-1)
  })

  it('legs only appear from step 2', () => {
    expect(frameAt(lack, 0, 1).has('leg1')).toBe(false)
    expect(frameAt(lack, 1, 0).has('leg1')).toBe(true)
  })

  it('end of one step equals start of the next', () => {
    for (let s = 0; s < lack.steps.length - 1; s++) {
      const end = frameAt(lack, s, 1)
      const next = frameAt(lack, s + 1, 0)
      for (const [id, pl] of end) expect(pl.p.distanceTo(next.get(id)!.p)).toBeLessThan(1e-6)
    }
  })

  it('finished table stands upright: top at 425 mm, glossy up, legs on floor', () => {
    const f = frameAt(lack, 3, 1)
    expect(f.get('top')!.p.y).toBeCloseTo(425)
    expect(up('top', 3, 1).y).toBeCloseTo(1)
    for (const id of ['leg1', 'leg2', 'leg3', 'leg4']) expect(f.get(id)!.p.y).toBeCloseTo(200)
  })

  it('screw stays attached to its leg during the flip', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7]) {
      const f = frameAt(lack, 2, t)
      const leg = f.get('leg1')!
      const screw = f.get('screw1')!
      // Screw sits 200 mm from the leg centre along the leg's own axis.
      const axis = new Vector3(0, 1, 0).applyQuaternion(leg.q)
      const rel = screw.p.clone().sub(leg.p)
      expect(Math.abs(rel.dot(axis))).toBeCloseTo(200, 0)
    }
  })

  it('explode moves active parts and leaves others alone', () => {
    const f = frameAt(lack, 2, 1)
    const e = explode(f, ['leg1'], 1)
    expect(e.get('leg1')!.p.distanceTo(f.get('leg1')!.p)).toBeCloseTo(250)
    expect(e.get('top')!.p.distanceTo(f.get('top')!.p)).toBe(0)
  })
})

describe('handAt', () => {
  it('every step uses both hands, each next to the part it holds', () => {
    lack.steps.forEach((s, i) => {
      expect(s.hands.map((h) => h.side).sort()).toEqual(['left', 'right'])
      for (const h of s.hands) {
        for (const t of [0, 0.3, 0.6, 1]) {
          const f = frameAt(lack, i, t)
          const pl = handAt(lack, i, t, f, h.side)
          expect(pl).not.toBeNull()
          // from the part's centre; the tabletop is held at its edge
          expect(pl!.p.distanceTo(f.get(h.follow)!.p)).toBeLessThan(400)
        }
      }
    })
  })

  it('both hands turn with the board they flip, and stay on opposite edges', () => {
    for (const side of ['left', 'right'] as const) {
      const before = handAt(lack, 0, 0, frameAt(lack, 0, 0), side)!
      const after = handAt(lack, 0, 1, frameAt(lack, 0, 1), side)!
      expect(before.q.angleTo(after.q)).toBeCloseTo(Math.PI, 2)
    }
    const f = frameAt(lack, 0, 0.5)
    const l = handAt(lack, 0, 0.5, f, 'left')!
    const r = handAt(lack, 0, 0.5, f, 'right')!
    expect(l.p.distanceTo(r.p)).toBeGreaterThan(550)
  })
})

describe('offline FAQ', () => {
  it('answers "which screw" on step 2', () => {
    expect(answerFromFaq(lack.steps[1], 'Which screw do I use?')).toMatch(/double-ended/i)
  })
  it('answers "how long" from the real-world timing', () => {
    expect(answerFromFaq(lack.steps[2], 'is this taking too long?')).toMatch(/most people take about 1½ minutes/i)
  })
  it('returns null when nothing matches', () => {
    expect(answerFromFaq(lack.steps[1], 'what is the meaning of life')).toBeNull()
  })
})

describe('voice commands', () => {
  it.each([
    ['next', { type: 'next' }],
    ['next step please', { type: 'next' }],
    ['go back', { type: 'back' }],
    ['again', { type: 'replay' }],
    ['show me that again', { type: 'replay' }],
    ['done', { type: 'done' }],
    ['explode', { type: 'explode' }],
    ['question which screw', { type: 'ask', text: 'which screw' }],
    ['which way up does the top go', { type: 'ask', text: 'which way up does the top go' }],
    ['banana', { type: 'unknown' }],
  ])('%s', (said, expected) => {
    expect(parseCommand(said)).toEqual(expected)
  })
})

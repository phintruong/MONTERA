import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { parseAssembly } from '../data/schema'
import { productIds, products } from '../data/products'
import { FOV, frameStep, stepPoints } from './framing'

const modules = import.meta.glob<unknown>('../../public/products/*.json', { eager: true, import: 'default' })
const all = [
  ...productIds.map((id) => [id, parseAssembly(products[id])] as const),
  ...Object.entries(modules).map(([path, raw]) => [path.split('/').pop()!, parseAssembly(raw)] as const),
]

// Phone portrait canvas, square, desktop.
const ASPECTS = [0.6, 1, 1.8]

describe('every step keeps what it is about in view', () => {
  it.each(all)('%s', (_, a) => {
    for (let s = 0; s < a.steps.length; s++) {
      for (const aspect of ASPECTS) {
        const { position, target } = frameStep(a, s, aspect)
        const cam = new PerspectiveCamera(FOV, aspect, 1, 1e7)
        cam.position.copy(position)
        cam.lookAt(target)
        cam.updateMatrixWorld()
        let worst = 0
        for (const p of stepPoints(a, s)) {
          const n = p.clone().project(cam)
          worst = Math.max(worst, Math.abs(n.x), Math.abs(n.y))
        }
        expect(worst, `${a.steps[s].id} at aspect ${aspect}`).toBeLessThanOrEqual(1)
      }
    }
  })
})

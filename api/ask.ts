// Vercel Function: POST /api/ask { product?: string, step: number, question: string } -> { answer: string }
// The model only sees the current step and its parts. Auth via AI Gateway (OIDC on Vercel,
// or AI_GATEWAY_API_KEY locally).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateText } from 'ai'
import lack from '../src/data/lack.json' with { type: 'json' }
import lackCoffee from '../src/data/lack-coffee.json' with { type: 'json' }
import lackTv from '../src/data/lack-tv.json' with { type: 'json' }

const MODEL = 'anthropic/claude-haiku-5-5'

interface StepData {
  title: string
  instruction: string
  tray: { part: string; count: number }[]
  warning?: string
  checklist: string[]
  typical?: { n: number; medianSec: number; p25Sec: number; p75Sec: number }
}
interface ProductData {
  product: { name: string; dims: string; note?: string }
  parts: Record<string, { name: string; size: number[]; hardware?: boolean }>
  instances: { id: string; part: string; label?: string }[]
  steps: (StepData & { active?: string[] })[]
}

// Bundled guides; keep in sync with src/data/products.ts.
const PRODUCTS: Record<string, unknown> = { lack, 'lack-coffee': lackCoffee, 'lack-tv': lackTv }

/** Bundled guide, or a generated one from public/products/ (shipped with this function via vercel.json). */
async function loadProduct(id: string): Promise<ProductData | null> {
  if (id in PRODUCTS) return PRODUCTS[id] as ProductData
  if (!/^(im|fp)-[a-z0-9-]+$/.test(id)) return null
  try {
    return JSON.parse(await readFile(join(process.cwd(), 'public', 'products', `${id}.json`), 'utf8')) as ProductData
  } catch {
    return null
  }
}

/** "Lettered parts in this step: A = Rail, about 31 cm (blue tag on the model); B = …" */
function lettered(data: ProductData, active: string[]): string {
  const tags = data.instances
    .filter((i) => i.label && active.includes(i.id))
    .map((i) => `${i.label} = ${data.parts[i.part]?.name ?? i.part}`)
  return tags.length ? `Lettered parts in this step (shown as blue letter tags on the 3D model): ${tags.join('; ')}.` : ''
}

export async function POST(req: Request): Promise<Response> {
  let body: { product?: unknown; step?: unknown; question?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  // Unknown products get a 404 and the client falls back to its offline FAQ.
  const id = typeof body.product === 'string' ? body.product : 'lack'
  const data = await loadProduct(id)
  if (!data) return Response.json({ error: 'unknown product' }, { status: 404 })
  const stepIndex = Number(body.step)
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : ''
  const step = data.steps[stepIndex]
  if (!step || !question) return Response.json({ error: 'need step and question' }, { status: 400 })

  const parts = data.parts
  const tray = step.tray.map((t) => `${parts[t.part].name} ×${t.count}`).join(', ') || 'none'
  const allParts = Object.values(parts)
    .map((p) => `${p.name}${p.hardware ? ` (${p.size[1]} mm long)` : ''}`)
    .join(', ')

  const context = [
    `Product: ${data.product.name} (${data.product.dims}).`,
    // Generated guides leave out fittings: the model must send people to the paper manual for those.
    data.product.note ? `About this guide: ${data.product.note}` : '',
    `All parts in the box: ${allParts}.`,
    `Current step ${stepIndex + 1} of ${data.steps.length}: ${step.title}.`,
    `Instruction: ${step.instruction}`,
    `Parts for this step: ${tray}.`,
    // Parts-only guides name parts by letter ("Join A and B"); the letters are drawn on the 3D model.
    lettered(data, step.active ?? []),
    step.warning ? `Warning: ${step.warning}` : '',
    `Checklist: ${step.checklist.join('; ')}.`,
    step.typical
      ? `In ${step.typical.n} recorded builds, most people took ${Math.round(step.typical.medianSec)} s on this step (middle half ${Math.round(step.typical.p25Sec)}–${Math.round(step.typical.p75Sec)} s).`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text } = await generateText({
      model: MODEL,
      instructions:
        'You help someone assembling flat-pack furniture who has their hands full. ' +
        'Answer in 1 to 3 short spoken sentences, using only the step context below. ' +
        'Never invent part numbers, parts, or tools that are not listed. ' +
        'If the context does not answer the question, say: "I\'m not sure — say again to replay the step."\n\n' +
        context,
      prompt: question,
      maxOutputTokens: 200,
      timeout: { totalMs: 8000 },
    })
    // An empty reply would show as a blank answer: fail instead, so the client uses its offline FAQ.
    if (!text.trim()) return Response.json({ error: 'empty answer' }, { status: 502 })
    return Response.json({ answer: text.trim(), source: 'llm' })
  } catch (err) {
    console.error('ask failed', err)
    return Response.json({ error: 'model unavailable' }, { status: 502 })
  }
}

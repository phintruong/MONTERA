// Vercel Function: POST /api/ask { product?: string, step: number, question: string } -> { answer: string }
// The model only sees the current step and its parts. Auth via AI Gateway (OIDC on Vercel,
// or AI_GATEWAY_API_KEY locally).
import { generateText } from 'ai'
import lack from '../src/data/lack.json' with { type: 'json' }
import lackCoffee from '../src/data/lack-coffee.json' with { type: 'json' }
import lackTv from '../src/data/lack-tv.json' with { type: 'json' }

const MODEL = 'anthropic/claude-haiku-5-5'

// Keep in sync with src/data/products.ts.
const PRODUCTS = { lack, 'lack-coffee': lackCoffee, 'lack-tv': lackTv }

export async function POST(req: Request): Promise<Response> {
  let body: { product?: unknown; step?: unknown; question?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  // Generated guides (public/products/) are not bundled here: say so, and the client uses its offline FAQ.
  const id = typeof body.product === 'string' ? body.product : 'lack'
  if (!(id in PRODUCTS)) return Response.json({ error: 'no model answers for this product' }, { status: 404 })
  const data = PRODUCTS[id as keyof typeof PRODUCTS]
  const stepIndex = Number(body.step)
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 300) : ''
  const step = data.steps[stepIndex]
  if (!step || !question) return Response.json({ error: 'need step and question' }, { status: 400 })

  const parts = data.parts as Record<string, { name: string; size: number[]; hardware?: boolean }>
  const tray = step.tray.map((t) => `${parts[t.part].name} ×${t.count}`).join(', ') || 'none'
  const allParts = Object.values(parts)
    .map((p) => `${p.name}${p.hardware ? ` (${p.size[1]} mm long)` : ''}`)
    .join(', ')

  const context = [
    `Product: ${data.product.name} (${data.product.dims}).`,
    `All parts in the box: ${allParts}.`,
    `Current step ${stepIndex + 1} of ${data.steps.length}: ${step.title}.`,
    `Instruction: ${step.instruction}`,
    `Parts for this step: ${tray}.`,
    'warning' in step && step.warning ? `Warning: ${step.warning}` : '',
    `Checklist: ${step.checklist.join('; ')}.`,
    'typical' in step && step.typical
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
    return Response.json({ answer: text.trim(), source: 'llm' })
  } catch (err) {
    console.error('ask failed', err)
    return Response.json({ error: 'model unavailable' }, { status: 502 })
  }
}

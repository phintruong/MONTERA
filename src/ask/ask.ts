import { assembly, productId } from '../store'
import { answerFromFaq } from './faq'

export interface Answer {
  text: string
  source: 'llm' | 'faq' | 'none'
}

const FALLBACK = 'I’m not sure. Say "again" to replay the step, or check the highlighted parts.'

export async function ask(step: number, question: string): Promise<Answer> {
  const faq = answerFromFaq(assembly.steps[step], question)
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: productId, step, question }),
        signal: AbortSignal.timeout(9000),
      })
      if (res.ok) {
        const { answer } = (await res.json()) as { answer?: string }
        if (answer) return { text: answer, source: 'llm' }
      }
    } catch {
      /* offline or no function in dev: fall through to FAQ */
    }
  }
  return faq ? { text: faq, source: 'faq' } : { text: FALLBACK, source: 'none' }
}

export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.05
  speechSynthesis.speak(u)
}

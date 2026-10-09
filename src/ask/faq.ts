import type { Step } from '../data/schema'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Best FAQ answer for the current step, or null. Longer keyword matches win. */
export function answerFromFaq(step: Step, question: string): string | null {
  const q = question.toLowerCase()
  let best: { score: number; answer: string } | null = null
  for (const entry of step.faq) {
    let score = 0
    for (const kw of entry.keywords) {
      if (new RegExp(`\\b${escape(kw.toLowerCase())}\\b`).test(q)) score += kw.length
    }
    if (score > 0 && (!best || score > best.score)) best = { score, answer: entry.answer }
  }
  return best?.answer ?? null
}

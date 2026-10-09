// Merges IKEA ASM timing (src/data/asm/<product>.json, from asm-stats.mjs) into generated steps.

// "about 5 seconds", "about 1½ minutes"
export function about(sec) {
  if (sec < 60) return `about ${Math.round(sec)} seconds`
  const halves = Math.round(sec / 30)
  const min = `${Math.floor(halves / 2) || ''}${halves % 2 ? '½' : ''}`
  return `about ${min} minute${halves > 2 ? 's' : ''}`
}

/** Adds `typical` and a "how long" FAQ entry to every step the dataset covers, and credits it. */
export function mergeAsm(data, asm) {
  data.sources = [asm.source]
  for (const step of data.steps) {
    const typical = asm.steps[step.id]
    if (!typical) continue
    step.typical = typical
    step.faq.push({
      keywords: ['how long', 'too long', 'too slow', 'taking long', 'normal'],
      answer: `Most people take ${about(typical.medianSec)} on this step. Take your time.`,
    })
  }
  return data
}

export type Command =
  | { type: 'next' | 'back' | 'replay' | 'done' | 'explode' | 'pause' | 'unknown' }
  | { type: 'ask'; text: string }

const QUESTION_START = /^(which|what|where|how|why|is|does|do|can|should|when)\b/

export function parseCommand(said: string): Command {
  const s = said.toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim()
  const ask = s.match(/^(question|hey guide|ask)\s+(.+)/)
  if (ask) return { type: 'ask', text: ask[2] }
  if (QUESTION_START.test(s) && s.split(' ').length >= 3) return { type: 'ask', text: s }
  if (/\b(again|replay|repeat)\b/.test(s)) return { type: 'replay' }
  if (/\b(back|previous|go back)\b/.test(s)) return { type: 'back' }
  if (/\b(next|continue|forward)\b/.test(s)) return { type: 'next' }
  if (/\b(done|finished|check|checked|ok done)\b/.test(s)) return { type: 'done' }
  if (/\b(explode|exploded|apart|pull apart)\b/.test(s)) return { type: 'explode' }
  if (/\b(stop|pause|wait)\b/.test(s)) return { type: 'pause' }
  return { type: 'unknown' }
}

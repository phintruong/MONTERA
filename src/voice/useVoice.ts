import { useCallback, useEffect, useRef, useState } from 'react'
import { parseCommand, type Command } from './commands'

// Minimal typing for the Web Speech API (Chrome ships it as webkitSpeechRecognition).
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

const Ctor: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition

export const voiceSupported = !!Ctor

export function useVoice(onCommand: (cmd: Command, heard: string) => void) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const rec = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const handler = useRef(onCommand)
  handler.current = onCommand

  const stop = useCallback(() => {
    wanted.current = false
    rec.current?.stop()
    setListening(false)
  }, [])

  const start = useCallback(() => {
    if (!Ctor) return
    if (!rec.current) {
      const r = new Ctor()
      r.continuous = true
      r.interimResults = false
      r.lang = 'en-US'
      r.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          // Ignore what we hear while the app itself is talking.
          if (!e.results[i].isFinal || speechSynthesis.speaking) continue
          const text = e.results[i][0].transcript.trim()
          setHeard(text)
          handler.current(parseCommand(text), text)
        }
      }
      // Chrome ends sessions after silence; restart while the user wants voice on.
      r.onend = () => {
        if (wanted.current) {
          try {
            r.start()
          } catch {
            /* already started */
          }
        } else setListening(false)
      }
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stop()
      }
      rec.current = r
    }
    wanted.current = true
    try {
      rec.current.start()
    } catch {
      /* already started */
    }
    setListening(true)
  }, [stop])

  useEffect(() => () => stop(), [stop])

  return { listening, heard, start, stop, supported: voiceSupported }
}

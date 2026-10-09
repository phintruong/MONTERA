// 24px stroke icons, ink by default (currentColor).
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const IconBack = () => (
  <svg {...base} aria-hidden>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)
export const IconReplay = () => (
  <svg {...base} aria-hidden>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </svg>
)
export const IconPlay = () => (
  <svg {...base} aria-hidden>
    <path d="M8 5l11 7-11 7z" fill="currentColor" />
  </svg>
)
export const IconPause = () => (
  <svg {...base} aria-hidden>
    <path d="M8 5v14M16 5v14" strokeWidth={3} />
  </svg>
)
export const IconMic = () => (
  <svg {...base} aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
)
export const IconExplode = () => (
  <svg {...base} aria-hidden>
    <rect x="9" y="9" width="6" height="6" />
    <path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3" />
  </svg>
)
export const IconWarning = () => (
  <svg {...base} aria-hidden>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5M12 18v.01" />
  </svg>
)
export const IconCheck = () => (
  <svg {...base} strokeWidth={3} aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

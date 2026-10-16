import { ElectionMode } from './election-map-model'

/** Small architectural illustrations that inherit the active chamber color. */
export function ChamberIllustration({ mode }: { mode: ElectionMode }) {
  return (
    <svg viewBox="0 0 96 64" fill="none" aria-hidden="true">
      <ellipse
        cx="48"
        cy="58"
        rx="43"
        ry="4"
        fill="currentColor"
        opacity=".08"
      />
      <g stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        {mode === 'senate' ? (
          <>
            <path d="M43 15h10M48 6v9M48 7h10v5H48M33 31a15 15 0 0 1 30 0" />
            <path d="M41 31c0-10 3-16 7-16s7 6 7 16M30 31h36v5H30z" />
            <path d="M12 39h18v15H12zM66 39h18v15H66z" opacity=".45" />
          </>
        ) : mode === 'house' ? (
          <>
            <path
              d="m15 29 33-18 33 18H15Z"
              fill="currentColor"
              fillOpacity=".08"
            />
            <path d="m27 26 21-11 21 11M14 30h68v5H14z" />
            <path d="M10 39h9v15h-9M77 39h9v15h-9" opacity=".45" />
          </>
        ) : (
          <>
            <path d="M48 5v14M49 6h14l-4 4 4 4H49" />
            <path
              d="m28 31 20-15 20 15H28Z"
              fill="currentColor"
              fillOpacity=".08"
            />
            <path d="M16 35h14v19H16zM66 35h14v19H66zM30 31h36v5H30z" />
            <path d="M21 40h4v5h-4zM71 40h4v5h-4z" opacity=".45" />
          </>
        )}
        {mode === 'house' ? (
          <path d="M21 36v17m11-17v17m11-17v17m11-17v17m11-17v17m10-17v17" />
        ) : (
          <path d="M34 37v16m9-16v16m10-16v16m9-16v16" />
        )}
        <path d="M13 54h70v4H13zM8 58h80" />
      </g>
    </svg>
  )
}

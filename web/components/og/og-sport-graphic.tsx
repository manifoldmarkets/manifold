/** The hero's sport glyphs as plain SVG for the OG renderer. */
export function OgSportGraphic({
  sport,
  scoped = false,
}: {
  sport?: string
  scoped?: boolean
}) {
  const ball = (() => {
    const key =
      !scoped &&
      [
        'football',
        'basketball',
        'wnba',
        'wncaab',
        'hockey',
        'mma',
        'esports',
      ].includes(sport ?? '')
        ? undefined
        : sport
    switch (key) {
      case 'football':
      case 'nfl':
      case 'ncaaf':
        return (
          <path d="M15 9l-6 6m1-3 2 2m0-4 2 2M8 21a5 5 0 0 0-5-5M16 3C8.82 3 3 8.82 3 16a5 5 0 0 0 5 5c7.18 0 13-5.82 13-13a5 5 0 0 0-5-5Zm0 0a5 5 0 0 0 5 5" />
        )
      case 'basketball':
      case 'wnba':
      case 'wncaab':
      case 'nba':
      case 'ncaab':
        return (
          <g>
            <circle cx="12" cy="12" r="9" />
            <path d="m5.65 5.65 12.7 12.7m-12.7 0 12.7-12.7M12 3a9 9 0 0 0 9 9M3 12a9 9 0 0 1 9 9" />
          </g>
        )
      case 'soccer':
        return (
          <g>
            <circle cx="12" cy="12" r="9" />
            <path d="m12 7 4.76 3.45L15 16H9l-1.76-5.55ZM12 7V3m3 13 2.5 3m-.74-8.55L20.5 9M9.06 16.05 6.5 19m.74-8.55L3.5 9" />
          </g>
        )
      case 'mlb':
        return (
          <g>
            <circle cx="12" cy="12" r="9" />
            <path d="M12.495 3.02a9 9 0 0 1-9.475 9.475m17.96-.99a9 9 0 0 0-9.475 9.475M9 9l2 2m2 2 2 2m-4-8 2 1m-6 3 1 2m8-2 1 2m-6 3 2 1" />
          </g>
        )
      case 'tennis':
        return (
          <g>
            <circle cx="12" cy="12" r="9" />
            <path d="M6 5.3a9 9 0 0 1 0 13.4M18 5.3a9 9 0 0 0 0 13.4" />
          </g>
        )
      case 'golf':
      case 'cricket':
        return (
          <g>
            <circle cx="12" cy="12" r="9" />
            {sport === 'cricket' ? (
              <path d="m5.6 18.4 12.8-12.8m-14 11.6L17.2 4.4m-10.4 15L19.6 6.8" />
            ) : (
              <g fill="currentColor" stroke="none">
                <circle cx="7" cy="12" r=".7" />
                <circle cx="9" cy="16" r=".7" />
                <circle cx="14" cy="17" r=".7" />
                <circle cx="12" cy="12" r=".7" />
                <circle cx="17" cy="13" r=".7" />
              </g>
            )}
          </g>
        )
      case 'hockey':
      case 'nhl':
        return (
          <g>
            <path d="m17 3-8 14H3v3h8L21 4M6 3l6 10" />
            <ellipse cx="18" cy="20" rx="3" ry="1" />
          </g>
        )
      case 'mma':
        return (
          <g>
            <path d="m8 2 8 0 6 6 0 8-6 6H8l-6-6V8Z" />
            <path d="m8.5 15-2-4.5a1.3 1.3 0 0 1 2.3-1.1l.7 1.2V7.2a1.3 1.3 0 0 1 2.6 0V10 6.8a1.3 1.3 0 0 1 2.6 0v3-1.6a1.1 1.1 0 0 1 2.2 0v4.3l-1.2 2.7v2.2H9v-2.1Z" />
          </g>
        )
      case 'esports':
        return (
          <g>
            <path d="M8 7h8c2 0 3.3 1.2 4 3.7l1 5.2c.5 2.2-1.8 3.7-3.5 2.1L15 15H9l-2.6 3c-1.7 1.6-4 .1-3.5-2.1L4 10.7C4.6 8.2 6 7 8 7Z" />
            <path d="M6.8 11.4h4m-2-2v4" />
            <circle cx="15.7" cy="11.8" r=".6" />
            <circle cx="17.8" cy="10" r=".6" />
          </g>
        )
      case 'f1':
        return (
          <g>
            <path d="M2 15h20l-3-5h-5l-3-4H8l2 7H4l-2 2Zm2-8H1m4 3H2" />
            <circle cx="6" cy="17" r="2" />
            <circle cx="18" cy="17" r="2" />
          </g>
        )
      default:
        return (
          <g>
            <path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm10 2h4v3a4 4 0 0 1-4 4M7 5H3v3a4 4 0 0 0 4 4m5 3v6m-4 0h8" />
          </g>
        )
    }
  })()
  return (
    <svg width={220} height={120} viewBox="0 0 220 120" fill="none">
      <path
        d="M12 110C25 64 50 25 90 26C53 32 28 69 12 110Z"
        fill="#4338ca"
        opacity=".35"
      />
      <path d="M23 114C41 70 64 46 91 44" stroke="#4338ca" opacity=".35" />
      <g
        transform="translate(72 8) scale(3.333333)"
        fill="none"
        stroke="#4338ca"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ball}
      </g>
    </svg>
  )
}

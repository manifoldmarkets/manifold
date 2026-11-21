/** The hero's sport glyphs as plain SVG for the OG renderer. */
export function OgSportGraphic({ sport }: { sport?: string }) {
  const ball = (() => {
    switch (sport) {
      case 'nfl':
      case 'ncaaf':
        return (
          <path d="M15 9l-6 6m1-3 2 2m0-4 2 2M8 21a5 5 0 0 0-5-5M16 3C8.82 3 3 8.82 3 16a5 5 0 0 0 5 5c7.18 0 13-5.82 13-13a5 5 0 0 0-5-5Zm0 0a5 5 0 0 0 5 5" />
        )
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
      case 'nhl':
        return (
          <g>
            <path d="m17 3-8 14H3v3h8L21 4M6 3l6 10" />
            <ellipse cx="18" cy="20" rx="3" ry="1" />
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

// NFL team color palette — primary and secondary hex per team.
//
// Used by the sports bet panel to give each team a recognisable chip color
// instead of generic YES/NO green and red.
//
// `nflMatchupColors` picks the most visually distinct pairing for a given
// matchup by scoring all four (primary|secondary) × (primary|secondary)
// combinations and returning the one with the highest contrast.

export interface TeamColors {
  primary: string
  secondary: string
}

export const NFL_TEAM_COLORS: Record<string, TeamColors> = {
  'Arizona Cardinals': { primary: '#97233F', secondary: '#000000' },
  'Atlanta Falcons': { primary: '#A71930', secondary: '#000000' },
  'Baltimore Ravens': { primary: '#241773', secondary: '#9E7C0C' },
  'Buffalo Bills': { primary: '#00338D', secondary: '#C60C30' },
  'Carolina Panthers': { primary: '#0085CA', secondary: '#101820' },
  'Chicago Bears': { primary: '#0B162A', secondary: '#C83803' },
  'Cincinnati Bengals': { primary: '#FB4F14', secondary: '#000000' },
  'Cleveland Browns': { primary: '#311D00', secondary: '#FF3C00' },
  'Dallas Cowboys': { primary: '#003594', secondary: '#869397' },
  'Denver Broncos': { primary: '#FB4F14', secondary: '#002244' },
  'Detroit Lions': { primary: '#0076B6', secondary: '#B0B7BC' },
  'Green Bay Packers': { primary: '#203731', secondary: '#FFB612' },
  'Houston Texans': { primary: '#03202F', secondary: '#A71930' },
  'Indianapolis Colts': { primary: '#002C5F', secondary: '#A2AAAD' },
  'Jacksonville Jaguars': { primary: '#101820', secondary: '#006778' },
  'Kansas City Chiefs': { primary: '#E31837', secondary: '#FFB81C' },
  'Las Vegas Raiders': { primary: '#000000', secondary: '#A5ACAF' },
  'Los Angeles Chargers': { primary: '#0080C6', secondary: '#FFC20E' },
  'Los Angeles Rams': { primary: '#003594', secondary: '#FFA300' },
  'Miami Dolphins': { primary: '#008E97', secondary: '#FC4C02' },
  'Minnesota Vikings': { primary: '#4F2683', secondary: '#FFC62F' },
  'New England Patriots': { primary: '#002244', secondary: '#C60C30' },
  'New Orleans Saints': { primary: '#D3BC8D', secondary: '#101820' },
  'New York Giants': { primary: '#0B2265', secondary: '#A71930' },
  'New York Jets': { primary: '#125740', secondary: '#000000' },
  'Philadelphia Eagles': { primary: '#004C54', secondary: '#565A5C' },
  'Pittsburgh Steelers': { primary: '#FFB612', secondary: '#101820' },
  'San Francisco 49ers': { primary: '#AA0000', secondary: '#B3995D' },
  'Seattle Seahawks': { primary: '#002244', secondary: '#69BE28' },
  'Tampa Bay Buccaneers': { primary: '#D50A0A', secondary: '#FF7900' },
  'Tennessee Titans': { primary: '#0C2340', secondary: '#4B92DB' },
  'Washington Commanders': { primary: '#5A1414', secondary: '#FFB612' },
}

// ── Color maths ───────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      break
    case g:
      h = ((b - r) / d + 2) / 6
      break
    case b:
      h = ((r - g) / d + 4) / 6
      break
  }
  return [h * 360, s * 100, l * 100]
}

/**
 * Perceptual distinctiveness score for two hex colors.
 * Higher = more visually distinguishable. Weights hue angle (circular) at 70%
 * and lightness difference at 30%.
 */
function distinctScore(a: string, b: string): number {
  const [h1, , l1] = hexToHsl(a)
  const [h2, , l2] = hexToHsl(b)
  const hueDiff = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2))
  const lightDiff = Math.abs(l1 - l2)
  return hueDiff * 0.7 + lightDiff * 0.3
}

/** Lightness (0–100) of a hex color. */
function lightness(hex: string): number {
  return hexToHsl(hex)[2]
}

/**
 * Returns the most visually distinct color pair for a head-to-head matchup.
 * Tries all four primary/secondary combinations and picks the one with the
 * highest distinctiveness score. Falls back to generic colors if neither team
 * is in the palette.
 */
export function nflMatchupColors(
  homeTeam: string,
  awayTeam: string
): { home: string; away: string } {
  const home = NFL_TEAM_COLORS[homeTeam]
  const away = NFL_TEAM_COLORS[awayTeam]

  if (!home && !away) return { home: '#1a1a1a', away: '#555555' }
  if (!home) return { home: '#1a1a1a', away: away.primary }
  if (!away) return { home: home.primary, away: '#555555' }

  const pairs: [string, string][] = [
    [home.primary, away.primary],
    [home.primary, away.secondary],
    [home.secondary, away.primary],
    [home.secondary, away.secondary],
  ]

  // Exclude pairs where either color is near-black (lightness < 12) and the
  // other is also near-black — they would be illegible and indistinguishable.
  const DARK_THRESHOLD = 12
  const readable = pairs.filter(
    ([h, a]) => !(lightness(h) < DARK_THRESHOLD && lightness(a) < DARK_THRESHOLD)
  )
  const candidates = readable.length > 0 ? readable : pairs

  let best = candidates[0]
  let bestScore = -1
  for (const pair of candidates) {
    const score = distinctScore(pair[0], pair[1])
    if (score > bestScore) {
      bestScore = score
      best = pair
    }
  }

  return { home: best[0], away: best[1] }
}

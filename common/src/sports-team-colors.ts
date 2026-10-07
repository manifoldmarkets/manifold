import { sortBy } from 'lodash'
import type { Answer } from './answer'
import { VERSUS_COLORS } from './new-contract'
import { SPORT_LEAGUE_LABEL, SportId } from './sports-calendar'

// ─── Team colours for game markets ────────────────────────────────────────────
//
// A game market's answers are its teams, and each answer can carry a colour
// (bet buttons, answer bars, the chart, the /sports badge). One colour has to
// work in both themes, so a team's brand colours are fitted into a luminance
// band rather than used as is: a navy is lightened, a bright gold darkened,
// keeping the hue. The away team takes its next brand colour when the first
// is too close to the home team's. Teams not listed here, or a matchup with
// no distinct pair, keep the defaults the market would get anyway.

/** Brand colours in the team's own order of preference. */
type Palette = readonly string[]

/** WCAG relative luminance range a colour is fitted into. */
export interface LuminanceBand {
  min: number
  max: number
}

/**
 * A versus market's answers fill its side buttons under white text, so they
 * stay dark enough for that, and light enough to see on the dark theme (the
 * default versus indigo is about 0.09).
 */
export const VERSUS_BAND: LuminanceBand = { min: 0.08, max: 0.3 }

/**
 * A three-way market's answers are drawn as bars behind the answer text, so
 * they sit in the lighter range of the default answer palette.
 */
export const THREE_WAY_BAND: LuminanceBand = { min: 0.19, max: 0.6 }

/**
 * Neutral for a soccer Draw answer, inside the three-way band. A pure grey,
 * so it stays clear of the many blue teams.
 */
export const DRAW_COLOR = '#A8A8A8'

/**
 * CIEDE2000 difference below which two colours read as one family: two
 * reds, two royal blues, orange against red. Red against gold is about 39.
 */
const MIN_DISTANCE = 20

const NFL: Record<string, Palette> = {
  'Arizona Cardinals': ['#97233F', '#FFB612'],
  'Atlanta Falcons': ['#A71930', '#A5ACAF'],
  'Baltimore Ravens': ['#241773', '#9E7C0C'],
  'Buffalo Bills': ['#00338D', '#C60C30'],
  'Carolina Panthers': ['#0085CA', '#BFC0BF'],
  'Chicago Bears': ['#C83803', '#0B162A'],
  'Cincinnati Bengals': ['#FB4F14', '#000000'],
  'Cleveland Browns': ['#FF3C00', '#311D00'],
  'Dallas Cowboys': ['#003594', '#869397'],
  'Denver Broncos': ['#FB4F14', '#002244'],
  'Detroit Lions': ['#0076B6', '#B0B7BC'],
  'Green Bay Packers': ['#203731', '#FFB612'],
  'Houston Texans': ['#03202F', '#A71930'],
  'Indianapolis Colts': ['#002C5F', '#A2AAAD'],
  'Jacksonville Jaguars': ['#006778', '#D7A22A'],
  'Kansas City Chiefs': ['#E31837', '#FFB81C'],
  'Las Vegas Raiders': ['#000000', '#A5ACAF'],
  'Los Angeles Chargers': ['#0080C6', '#FFC20E'],
  'Los Angeles Rams': ['#003594', '#FFA300'],
  'Miami Dolphins': ['#008E97', '#FC4C02'],
  'Minnesota Vikings': ['#4F2683', '#FFC62F'],
  'New England Patriots': ['#002244', '#C60C30'],
  'New Orleans Saints': ['#D3BC8D', '#101820'],
  'New York Giants': ['#0B2265', '#A71930'],
  'New York Jets': ['#125740', '#000000'],
  'Philadelphia Eagles': ['#004C54', '#A5ACAF'],
  'Pittsburgh Steelers': ['#FFB612', '#101820'],
  'San Francisco 49ers': ['#AA0000', '#B3995D'],
  'Seattle Seahawks': ['#69BE28', '#002244'],
  'Tampa Bay Buccaneers': ['#D50A0A', '#FF7900', '#34302B'],
  'Tennessee Titans': ['#4B92DB', '#0C2340', '#C8102E'],
  'Washington Commanders': ['#5A1414', '#FFB612'],
}

const MLB: Record<string, Palette> = {
  'Arizona Diamondbacks': ['#A71930', '#E3D4AD'],
  Athletics: ['#003831', '#EFB21E'],
  'Oakland Athletics': ['#003831', '#EFB21E'],
  'Atlanta Braves': ['#CE1141', '#13274F'],
  'Baltimore Orioles': ['#DF4601', '#000000'],
  'Boston Red Sox': ['#BD3039', '#0C2340'],
  'Chicago Cubs': ['#0E3386', '#CC3433'],
  'Chicago White Sox': ['#27251F', '#C4CED4'],
  'Cincinnati Reds': ['#C6011F', '#000000'],
  'Cleveland Guardians': ['#E50022', '#00385D'],
  'Colorado Rockies': ['#333366', '#C4CED4'],
  'Detroit Tigers': ['#0C2340', '#FA4616'],
  'Houston Astros': ['#EB6E1F', '#002D62'],
  'Kansas City Royals': ['#004687', '#BD9B60'],
  'Los Angeles Angels': ['#BA0021', '#003263'],
  'Los Angeles Dodgers': ['#005A9C', '#EF3E42'],
  'Miami Marlins': ['#00A3E0', '#EF3340'],
  'Milwaukee Brewers': ['#12284B', '#FFC52F'],
  'Minnesota Twins': ['#002B5C', '#D31145'],
  'New York Mets': ['#002D72', '#FF5910'],
  'New York Yankees': ['#003087', '#C4CED3'],
  'Philadelphia Phillies': ['#E81828', '#002D72'],
  'Pittsburgh Pirates': ['#FDB827', '#27251F'],
  'San Diego Padres': ['#2F241D', '#FFC425'],
  'San Francisco Giants': ['#FD5A1E', '#27251F'],
  'Seattle Mariners': ['#005C5C', '#0C2C56'],
  'St. Louis Cardinals': ['#C41E3A', '#0C2340'],
  'St Louis Cardinals': ['#C41E3A', '#0C2340'],
  'Tampa Bay Rays': ['#092C5C', '#8FBCE6', '#F5D130'],
  'Texas Rangers': ['#003278', '#C0111F'],
  'Toronto Blue Jays': ['#134A8E', '#E8291C'],
  'Washington Nationals': ['#AB0003', '#14225A'],
}

const NBA: Record<string, Palette> = {
  'Atlanta Hawks': ['#E03A3E', '#C1D32F'],
  'Boston Celtics': ['#007A33', '#BA9653'],
  'Brooklyn Nets': ['#000000', '#FFFFFF'],
  'Charlotte Hornets': ['#00788C', '#1D1160'],
  'Chicago Bulls': ['#CE1141', '#000000'],
  'Cleveland Cavaliers': ['#860038', '#FDBB30'],
  'Dallas Mavericks': ['#00538C', '#B8C4CA'],
  'Denver Nuggets': ['#FEC524', '#0E2240', '#8B2131'],
  'Detroit Pistons': ['#C8102E', '#1D42BA'],
  'Golden State Warriors': ['#1D428A', '#FFC72C'],
  'Houston Rockets': ['#CE1141', '#C4CED4'],
  'Indiana Pacers': ['#FDBB30', '#002D62'],
  'Los Angeles Clippers': ['#C8102E', '#1D428A'],
  'Los Angeles Lakers': ['#552583', '#FDB927'],
  'Memphis Grizzlies': ['#5D76A9', '#F5B112'],
  'Miami Heat': ['#98002E', '#F9A01B'],
  'Milwaukee Bucks': ['#00471B', '#0077C0'],
  'Minnesota Timberwolves': ['#236192', '#78BE20'],
  'New Orleans Pelicans': ['#85714D', '#C8102E', '#0C2340'],
  'New York Knicks': ['#F58426', '#006BB6'],
  'Oklahoma City Thunder': ['#007AC1', '#EF3B24'],
  'Orlando Magic': ['#0077C0', '#C4CED4'],
  'Philadelphia 76ers': ['#006BB6', '#ED174C'],
  'Phoenix Suns': ['#E56020', '#1D1160'],
  'Portland Trail Blazers': ['#E03A3E', '#000000'],
  'Sacramento Kings': ['#5A2D81', '#63727A'],
  'San Antonio Spurs': ['#C4CED4', '#000000'],
  'Toronto Raptors': ['#CE1141', '#A1A1A4'],
  'Utah Jazz': ['#002B5C', '#F9A01B'],
  'Washington Wizards': ['#002B5C', '#E31837'],
}

const WNBA: Record<string, Palette> = {
  'Atlanta Dream': ['#E31837', '#5091CD'],
  'Chicago Sky': ['#418FDE', '#FFCD00'],
  'Connecticut Sun': ['#F05023', '#0A2240'],
  'Dallas Wings': ['#002B5C', '#C4D600'],
  'Indiana Fever': ['#E03A3E', '#002D62', '#FFD520'],
  'Las Vegas Aces': ['#BA0C2F', '#A7A8AA'],
  'Los Angeles Sparks': ['#552583', '#FDB927'],
  'Minnesota Lynx': ['#236192', '#78BE20'],
  'New York Liberty': ['#6ECEB2', '#000000'],
  'Phoenix Mercury': ['#CB6015', '#201747'],
  'Seattle Storm': ['#2C5234', '#FEE11A'],
  'Washington Mystics': ['#E03A3E', '#002B5C'],
  'Golden State Valkyries': ['#6B3FA0', '#000000'],
}

// The Premier League and the clubs moving in and out of it.
const SOCCER: Record<string, Palette> = {
  Arsenal: ['#EF0107', '#063672'],
  'Aston Villa': ['#670E36', '#95BFE5'],
  Bournemouth: ['#DA291C', '#000000'],
  Brentford: ['#E30613', '#FBB800'],
  'Brighton and Hove Albion': ['#0057B8', '#FFCD00'],
  Burnley: ['#6C1D45', '#99D6EA'],
  Chelsea: ['#034694', '#DBA111'],
  'Coventry City': ['#59CBE8', '#000000'],
  'Crystal Palace': ['#1B458F', '#C4122E'],
  Everton: ['#003399', '#FFFFFF'],
  Fulham: ['#000000', '#CC0000'],
  'Ipswich Town': ['#3A64A3', '#DE2C37'],
  'Leeds United': ['#1D428A', '#FFCD00'],
  'Leicester City': ['#003090', '#FDBE11'],
  Liverpool: ['#C8102E', '#00B2A9'],
  'Manchester City': ['#6CABDD', '#1C2C5B'],
  'Manchester United': ['#DA291C', '#FBE122'],
  Middlesbrough: ['#E11B22', '#000000'],
  'Newcastle United': ['#241F20', '#41B6E6'],
  'Nottingham Forest': ['#DD0000', '#FFFFFF'],
  'Sheffield United': ['#EE2737', '#000000'],
  Southampton: ['#D71920', '#130C0E'],
  Sunderland: ['#EB172B', '#211E1E'],
  'Tottenham Hotspur': ['#132257', '#FFFFFF'],
  'West Ham United': ['#7A263A', '#1BB1E7'],
  'Wolverhampton Wanderers': ['#FDB913', '#231F20'],
}

export const TEAM_PALETTES: Partial<Record<SportId, Record<string, Palette>>> =
  {
    nfl: NFL,
    mlb: MLB,
    nba: NBA,
    wnba: WNBA,
    soccer: SOCCER,
  }

/** Lowercase, `&` as "and", no punctuation or FC/AFC-style club suffixes. */
function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['fc', 'afc', 'cf', 'sc'].includes(w))
    .join(' ')
}

const NORMALIZED: Partial<Record<SportId, Map<string, Palette>>> =
  Object.fromEntries(
    Object.entries(TEAM_PALETTES).map(([sport, teams]) => [
      sport,
      new Map(
        Object.entries(teams).map(([name, p]) => [normalizeTeam(name), p])
      ),
    ])
  )

export function teamPalette(sport: SportId, team: string): Palette | undefined {
  return NORMALIZED[sport]?.get(normalizeTeam(team))
}

/**
 * Colours for a game's answers in order (home, away, and Draw for a three-way
 * market), or undefined to keep the defaults: a team we have no colours for,
 * or no pair far enough apart.
 */
export function gameAnswerColors(
  sport: SportId,
  home: string,
  away: string,
  threeWay: boolean
): string[] | undefined {
  const homePalette = teamPalette(sport, home)
  const awayPalette = teamPalette(sport, away)
  if (!homePalette || !awayPalette) return undefined
  const band = threeWay ? THREE_WAY_BAND : VERSUS_BAND
  const avoid = threeWay ? [DRAW_COLOR] : []
  const homeColor = pickTeamColor(homePalette, band, avoid)
  if (!homeColor) return undefined
  const awayColor = pickTeamColor(awayPalette, band, [...avoid, homeColor])
  if (!awayColor) return undefined
  return threeWay ? [homeColor, awayColor, DRAW_COLOR] : [homeColor, awayColor]
}

/**
 * The colours an existing game market's answers should change to, for games
 * created before markets were coloured: undefined unless the answers are
 * still home, away (and Draw) as created, on the colours they were created
 * with, and both teams have colours.
 */
export function gameAnswerColorBackfill(
  market: {
    sportsLeague?: string
    sportsHomeTeam?: string
    sportsAwayTeam?: string
  },
  answers: Pick<Answer, 'id' | 'index' | 'text' | 'color'>[]
): { id: string; color: string }[] | undefined {
  const sport = (Object.keys(SPORT_LEAGUE_LABEL) as SportId[]).find(
    (id) => SPORT_LEAGUE_LABEL[id] === market.sportsLeague
  )
  const { sportsHomeTeam: home, sportsAwayTeam: away } = market
  if (!sport || !home || !away) return undefined
  const ordered = sortBy(answers, (a) => a.index)
  const texts = ordered.map((a) => a.text)
  const threeWay = texts.length === 3 && texts[2] === 'Draw'
  if (texts[0] !== home || texts[1] !== away) return undefined
  if (texts.length !== (threeWay ? 3 : 2)) return undefined
  const current = ordered.map((a) => a.color?.toLowerCase())
  const untouched =
    current.every((c) => c === undefined) ||
    (!threeWay && current.every((c, i) => c === VERSUS_COLORS[i]))
  if (!untouched) return undefined
  const colors = gameAnswerColors(sport, home, away, threeWay)
  return colors && ordered.map((a, i) => ({ id: a.id, color: colors[i] }))
}

/**
 * The first of a team's colours, fitted to `band`, that is far enough from
 * every colour in `avoid`. Coloured options come before black, white and
 * greys, which only a team with nothing else gets.
 */
export function pickTeamColor(
  palette: Palette,
  band: LuminanceBand,
  avoid: string[] = []
): string | undefined {
  const ordered = [
    ...palette.filter((c) => isChromatic(c)),
    ...palette.filter((c) => !isChromatic(c)),
  ]
  for (const color of ordered) {
    const fitted = fitLuminance(color, band)
    if (avoid.every((other) => colorDistance(fitted, other) >= MIN_DISTANCE))
      return fitted
  }
  return undefined
}

// ─── Colour maths ─────────────────────────────────────────────────────────────

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase()
}

const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Black, white and greys have no hue worth keeping. */
function isChromatic(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex)
  return Math.max(r, g, b) - Math.min(r, g, b) > 40
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === rn
      ? (gn - bn) / d + (gn < bn ? 6 : 0)
      : max === gn
      ? (bn - rn) / d + 2
      : (rn - gn) / d + 4
  return [h / 6, s, l]
}

function hslToRgb([h, s, l]: [number, number, number]): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255]
}

/**
 * Move a colour's HSL lightness until its luminance sits inside `band`,
 * keeping hue and saturation, so a navy stays blue and a gold stays gold.
 */
export function fitLuminance(hex: string, band: LuminanceBand): string {
  const luminance = relativeLuminance(hex)
  if (luminance >= band.min && luminance <= band.max) return hex.toUpperCase()
  const tooDark = luminance < band.min
  const target = tooDark ? band.min : band.max
  const [h, s, l] = rgbToHsl(hexToRgb(hex))
  // Luminance rises with lightness, so bisect lightness for the target.
  let lo = tooDark ? l : 0
  let hi = tooDark ? 1 : l
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    const lum = relativeLuminance(rgbToHex(hslToRgb([h, s, mid])))
    if (lum < target) lo = mid
    else hi = mid
  }
  // Take the side of the bisection inside the band.
  return rgbToHex(hslToRgb([h, s, tooDark ? hi : lo]))
}

function rgbToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** CIEDE2000 difference between two hex colours: about 2 is just noticeable. */
export function colorDistance(a: string, b: string): number {
  return ciede2000(rgbToLab(a), rgbToLab(b))
}

const rad = (deg: number) => (deg * Math.PI) / 180
const deg = (rad: number) => (rad * 180) / Math.PI

/** Sharma, Wu & Dalal (2005), with kL = kC = kH = 1. */
export function ciede2000(
  [l1, a1, b1]: [number, number, number],
  [l2, a2, b2]: [number, number, number]
): number {
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)))
  const a1p = (1 + g) * a1
  const a2p = (1 + g) * a2
  const c1p = Math.hypot(a1p, b1)
  const c2p = Math.hypot(a2p, b2)
  const hue = (b: number, a: number) =>
    a === 0 && b === 0 ? 0 : (deg(Math.atan2(b, a)) + 360) % 360
  const h1p = hue(b1, a1p)
  const h2p = hue(b2, a2p)
  const achromatic = c1p * c2p === 0

  let dhp = achromatic ? 0 : h2p - h1p
  if (dhp > 180) dhp -= 360
  else if (dhp < -180) dhp += 360
  const dLp = l2 - l1
  const dCp = c2p - c1p
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2))

  const lBarP = (l1 + l2) / 2
  const cBarP = (c1p + c2p) / 2
  const hBarP = achromatic
    ? h1p + h2p
    : Math.abs(h1p - h2p) <= 180
    ? (h1p + h2p) / 2
    : h1p + h2p < 360
    ? (h1p + h2p + 360) / 2
    : (h1p + h2p - 360) / 2

  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63))
  const dTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2))
  const rC = 2 * Math.sqrt(cBarP ** 7 / (cBarP ** 7 + 25 ** 7))
  const sL = 1 + (0.015 * (lBarP - 50) ** 2) / Math.sqrt(20 + (lBarP - 50) ** 2)
  const sC = 1 + 0.045 * cBarP
  const sH = 1 + 0.015 * cBarP * t
  const rT = -Math.sin(rad(2 * dTheta)) * rC

  return Math.sqrt(
    (dLp / sL) ** 2 +
      (dCp / sC) ** 2 +
      (dHp / sH) ** 2 +
      rT * (dCp / sC) * (dHp / sH)
  )
}

/** Black or white text, whichever reads better on `hex`. */
export function readableTextColor(hex: string): '#000000' | '#FFFFFF' {
  const luminance = relativeLuminance(hex)
  // Contrast with white is 1.05/(L+0.05); with black (L+0.05)/0.05.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05
    ? '#FFFFFF'
    : '#000000'
}

// Mani, the mascot 🐦 — Android twin of ManiView in targets/widget/index.swift.
//
// A faceted purple origami-crane head that peeks from the small widget's
// bottom-right corner and EMOTES: its mood tracks the streak state and the
// time left in the day, Duolingo-style — the face is the notification. The
// POSE within a mood rotates by (pacificDayOfYear + streak) % variants:
// changes daily and differs between users, but is stable all day.
//
// Rendered via SvgWidget (same as UNLIT_FLAME_SVG), so each pose is an inline
// SVG string in the shared 120×140 design space. NOTE: androidsvg does NOT
// reliably render emoji in <text>, so the 💢/❄/✦ accents iOS draws as glyphs
// are drawn as vector marks here; plain latin text ("z", "!") is fine.

export type ManiState = 'lit' | 'pending' | 'frozen' | 'loggedOut'

export type ManiPose =
  | 'happyClassic' | 'smug' | 'starstruck' | 'party' | 'fireEye' // lit
  | 'heartEye' | 'blushing' | 'chirping'                         // lit extras
  | 'earlyBird' | 'nightOwl' | 'ecstatic'                        // behaviour-aware
  | 'watching' | 'sideEye' | 'quizzical'                         // pending >12h
  | 'sweating' | 'alarmed'                                       // pending <12h
  | 'madClassic' | 'fuming' | 'disappointed'                     // pending <4h
  | 'icy' | 'shivering'                                          // frozen
  | 'asleep'                                                     // logged out

// Streaks that get the one-day party hat (the day you cross a milestone).
const PARTY_STREAKS = new Set([30, 50, 100, 200, 365, 500, 1000])

const HOUR = 3_600_000

// Mirrors maniPose() in index.swift exactly — keep the two in lockstep so the
// same user sees the same mood on both platforms on the same day.
// betHour: DEVICE-local hour of the last bet (null if unknown) — dawn bets get
// the early bird, late-night ones the night owl. allQuestsDone → ecstatic.
export function pickManiPose(
  state: ManiState,
  remainingMs: number,
  streak: number,
  day: number,
  betHour?: number | null,
  allQuestsDone?: boolean
): ManiPose {
  if (state === 'loggedOut') return 'asleep'
  const roll = day + streak
  if (state === 'frozen') return (['icy', 'shivering'] as const)[roll % 2]
  if (state === 'lit') {
    if (PARTY_STREAKS.has(streak)) return 'party'
    if (allQuestsDone) return 'ecstatic'
    if (betHour != null) {
      if (betHour < 9) return 'earlyBird'
      if (betHour >= 22) return 'nightOwl'
    }
    // The lit face is what a keeper sees 99% of the time, so it gets the
    // widest rotation (mirrors index.swift): fireEye is the rare manic roll,
    // starstruck joins on gold.
    const happy =
      streak >= 30
        ? ([
            'happyClassic', 'heartEye', 'smug', 'starstruck',
            'blushing', 'fireEye', 'chirping', 'smug',
          ] as const)
        : ([
            'happyClassic', 'heartEye', 'smug', 'chirping',
            'blushing', 'fireEye', 'happyClassic', 'chirping',
          ] as const)
    return happy[roll % happy.length]
  }
  if (remainingMs <= 4 * HOUR)
    return (['madClassic', 'fuming', 'disappointed'] as const)[roll % 3]
  if (remainingMs <= 12 * HOUR)
    return (['sweating', 'alarmed'] as const)[roll % 2]
  return (['watching', 'sideEye', 'quizzical'] as const)[roll % 3]
}

type Palette = {
  neckShade: string
  neck: string
  head: string
  jaw: string
  beak: string
}

const PURPLE: Palette = {
  neckShade: '#4F3FD6', neck: '#6C5CE7', head: '#8B7BF7',
  jaw: '#5B4BE0', beak: '#3B2FB8',
}
const ICE_P: Palette = {
  neckShade: '#3568B8', neck: '#4A7FD6', head: '#7FB7F0',
  jaw: '#4A7FD6', beak: '#2F5FB8',
}
const GREY_P: Palette = {
  neckShade: '#4a4a55', neck: '#5c5c68', head: '#73737f',
  jaw: '#5c5c68', beak: '#3f3f4a',
}

const INK = '#2a2258' // brows/lids on the purple body
const PUPIL = '#1c1633'

function body(p: Palette): string {
  return (
    `<polygon points="100,140 114,140 104,68 94,70" fill="${p.neckShade}"/>` +
    `<polygon points="78,140 100,140 94,70 80,74" fill="${p.neck}"/>` +
    `<polygon points="50,36 92,30 102,66 66,74" fill="${p.head}"/>` +
    `<polygon points="66,74 102,66 94,70 80,74" fill="${p.jaw}"/>` +
    `<polygon points="54,48 64,70 8,62" fill="${p.beak}"/>`
  )
}

const eye = (x: number, y: number, r: number, px: number, py: number, pr: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>` +
  `<circle cx="${px}" cy="${py}" r="${pr}" fill="${PUPIL}"/>`

const browLine = (x1: number, y1: number, x2: number, y2: number, w: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w}" stroke-linecap="round"/>`

// Small 4-point star (the ✦ accent, drawn as a polygon).
function spark(cx: number, cy: number, r: number, fill: string): string {
  const s = r * 0.35
  return `<polygon points="${cx},${cy - r} ${cx + s},${cy - s} ${cx + r},${cy} ${cx + s},${cy + s} ${cx},${cy + r} ${cx - s},${cy + s} ${cx - r},${cy} ${cx - s},${cy - s}" fill="${fill}"/>`
}

const FACES: Record<ManiPose, string> = {
  happyClassic:
    '<path d="M68,50 Q77,41 86,50" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
  heartEye:
    '<circle cx="78" cy="50" r="8" fill="#fff"/>' +
    '<path d="M78,54.5 c-4,-3.5 -7.5,-5.6 -7.5,-8.3 c0,-2.4 2.2,-3.7 4.2,-3 c1.4,0.5 2.4,1.6 3.3,3 c0.9,-1.4 1.9,-2.5 3.3,-3 c2,-0.7 4.2,0.6 4.2,3 c0,2.7 -3.5,4.8 -7.5,8.3 z" fill="#FF5C8A"/>',
  blushing:
    '<path d="M68,50 Q77,41 86,50" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="60" cy="60" rx="5" ry="3" fill="#FF9DB5" opacity="0.75"/>',
  chirping:
    '<path d="M68,50 Q77,41 86,50" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
    // eighth note, drawn (androidsvg font coverage for ♪ is unreliable)
    '<circle cx="99" cy="28" r="3" fill="#fff"/>' +
    '<rect x="100.8" y="14" width="2.4" height="14" fill="#fff"/>' +
    '<path d="M103.2,14 q5,1.5 4,6 q-1,-2.5 -4,-3 z" fill="#fff"/>',
  earlyBird:
    '<path d="M68,50 Q77,41 86,50" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
    '<circle cx="100" cy="23" r="4.5" fill="#FFD24D"/>' +
    '<g stroke="#FFD24D" stroke-width="2" stroke-linecap="round">' +
    '<line x1="100" y1="14" x2="100" y2="16.5"/><line x1="100" y1="29.5" x2="100" y2="32"/>' +
    '<line x1="91" y1="23" x2="93.5" y2="23"/><line x1="106.5" y1="23" x2="109" y2="23"/>' +
    '<line x1="93.6" y1="16.6" x2="95.4" y2="18.4"/><line x1="104.6" y1="27.6" x2="106.4" y2="29.4"/>' +
    '<line x1="106.4" y1="16.6" x2="104.6" y2="18.4"/><line x1="95.4" y1="27.6" x2="93.6" y2="29.4"/></g>',
  nightOwl:
    '<path d="M70,49 A8,8 0 0 0 86,49 Z" fill="#fff"/>' +
    `<circle cx="78" cy="51" r="2.6" fill="${PUPIL}"/>` +
    // crescent moon (two-arc cutout)
    '<path d="M98,16.5 a5.5,5.5 0 1 0 0.1,11 a4.4,4.4 0 1 1 -0.1,-11 z" fill="#CADCFF"/>',
  ecstatic:
    '<circle cx="78" cy="50" r="8.5" fill="#fff"/>' +
    '<polygon points="78,44.5 80,48 83.5,50 80,52 78,55.5 76,52 72.5,50 76,48" fill="#FFD24D"/>' +
    `<path d="M64,37 Q76,30 88,35" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` +
    spark(98, 24, 6, '#FFE891') +
    spark(106, 38, 4, '#FFE891'),
  smug:
    '<path d="M70,49 A8,8 0 0 0 86,49 Z" fill="#fff"/>' +
    `<circle cx="78" cy="51" r="2.6" fill="${PUPIL}"/>` +
    browLine(69, 46, 87, 46, 3.5),
  starstruck:
    '<polygon points="78,41 81,47 88,50 81,53 78,59 75,53 68,50 75,47" fill="#FFD24D"/>' +
    spark(98, 22, 6, '#FFE891') +
    spark(106, 41, 4, '#FFE891'),
  party:
    '<path d="M68,50 Q77,41 86,50" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
    '<polygon points="72,10 86,29 57,32" fill="#FF5C8A"/>' +
    '<circle cx="72" cy="10" r="3.5" fill="#fff"/>' +
    '<circle cx="48" cy="22" r="2" fill="#FFD24D"/>' +
    '<circle cx="102" cy="18" r="2" fill="#8fdcff"/>' +
    '<circle cx="60" cy="14" r="2" fill="#7CFFB2"/>' +
    '<circle cx="96" cy="32" r="2" fill="#FFB3C7"/>',
  fireEye:
    '<circle cx="78" cy="50" r="8.5" fill="#fff"/>' +
    '<path d="M78,43.5 q-5.5,7.5 0,13.5 q5.5,-6 0,-13.5" fill="#FF8A3D"/>' +
    '<path d="M78,48 q-2.6,4.2 0,7.2 q2.6,-3 0,-7.2" fill="#FFD24D"/>' +
    `<path d="M64,38 Q76,29 90,35" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    spark(98, 27, 5, '#FFB86B'),
  watching: eye(78, 50, 7, 75, 51, 3.2),
  sideEye: eye(78, 51, 7, 72, 52, 3.2),
  quizzical:
    eye(78, 52, 6.5, 76, 53, 3) +
    `<path d="M66,38 Q78,31 90,38" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  sweating:
    eye(78, 52, 6, 76, 53, 2.8) +
    browLine(66, 40, 90, 44, 4) +
    '<path d="M97,30 q6,8 0,12 q-6,-4 0,-12" fill="#9fd6ff"/>',
  alarmed:
    eye(78, 51, 8.5, 78, 52, 2.2) +
    '<text x="97" y="33" font-size="18" font-weight="bold" fill="#fff">!</text>',
  madClassic: eye(78, 52, 6.5, 75, 52, 3) + browLine(64, 47, 90, 37, 5),
  fuming:
    '<line x1="70" y1="52" x2="86" y2="49" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>' +
    browLine(64, 46, 90, 36, 5) +
    // anime anger mark (💢), drawn: four corner ticks
    '<g stroke="#FF5C5C" stroke-width="3" stroke-linecap="round">' +
    '<line x1="93" y1="21" x2="98" y2="26"/><line x1="103" y1="21" x2="98" y2="26"/>' +
    '<line x1="93" y1="31" x2="98" y2="26"/><line x1="103" y1="31" x2="98" y2="26"/></g>',
  disappointed: eye(78, 51, 6.5, 77, 53, 2.8) + browLine(70, 45, 86, 45, 4),
  icy:
    eye(78, 51, 6, 76, 52, 2.8) +
    // snowflake (❄), drawn: 6-arm star
    '<g stroke="#dff2ff" stroke-width="2" stroke-linecap="round">' +
    '<line x1="101" y1="16" x2="101" y2="30"/>' +
    '<line x1="95" y1="19" x2="107" y2="27"/>' +
    '<line x1="107" y1="19" x2="95" y2="27"/></g>',
  shivering:
    eye(78, 51, 6, 76, 52, 2.8) +
    '<g stroke="#dff2ff" fill="none" stroke-linecap="round">' +
    '<path d="M46,34 q-5,5 0,10" stroke-width="2.5"/>' +
    '<path d="M42,30 q-7,7 0,16" stroke-width="2" opacity="0.6"/>' +
    '<path d="M106,42 q5,5 0,10" stroke-width="2.5"/></g>',
  asleep:
    '<line x1="70" y1="50" x2="86" y2="50" stroke="#fff" stroke-width="4" stroke-linecap="round"/>' +
    '<text x="94" y="32" font-size="14" font-weight="bold" fill="#cfcfda">z</text>' +
    '<text x="104" y="22" font-size="11" font-weight="bold" fill="#b5b5c2">z</text>',
}

// The poses are authored in a 120×140 design space, but the rendered viewport
// crops the right/bottom edges (110×118) so the neck is clearly CUT by the
// widget edge (a flush 126 crop still read as "the whole bird fits inside") —
// the same corner "bleed" iOS achieves by offsetting ManiView past the edge.
// Size the SvgWidget frame with this exact ratio: androidsvg letterboxes
// (re-centering, killing the bottom anchor) if the frame ratio differs.
export const MANI_ASPECT = 118 / 110

export function maniSvg(pose: ManiPose): string {
  const pal =
    pose === 'icy' || pose === 'shivering'
      ? ICE_P
      : pose === 'asleep'
      ? GREY_P
      : PURPLE
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 118">' +
    body(pal) +
    FACES[pose] +
    '</svg>'
  )
}

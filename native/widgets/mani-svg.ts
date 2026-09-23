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

// Seasonal dress-up, gated on the DEVICE-local calendar date (holidays happen
// where the phone is). Mirrors maniSeason() in index.swift.
export type ManiSeason = 'none' | 'halloween' | 'christmas' | 'newYear'

export function maniSeason(date: Date): ManiSeason {
  const m = date.getMonth() + 1
  const d = date.getDate()
  if (m === 10 && d >= 24) return 'halloween'
  if (m === 12 && d >= 18 && d <= 26) return 'christmas'
  if ((m === 12 && d === 31) || (m === 1 && d === 1)) return 'newYear'
  return 'none'
}

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

// The night owl's beak droops toward the floor — a bird nodding off.
function body(p: Palette, drowsy?: boolean): string {
  const beakTip = drowsy ? '12,80' : '8,62'
  return (
    `<polygon points="100,140 114,140 104,68 94,70" fill="${p.neckShade}"/>` +
    `<polygon points="78,140 100,140 94,70 80,74" fill="${p.neck}"/>` +
    `<polygon points="50,36 92,30 102,66 66,74" fill="${p.head}"/>` +
    `<polygon points="66,74 102,66 94,70 80,74" fill="${p.jaw}"/>` +
    `<polygon points="54,48 64,70 ${beakTip}" fill="${p.beak}"/>`
  )
}

// Seasonal accessories drawn over the finished pose. All-vector (androidsvg).
// Split hat/scene: the party pose keeps ITS hat (two hats stack ridiculously),
// but scene items (bat, pumpkin, snow, firework) always draw.
const SEASONS: Record<
  Exclude<ManiSeason, 'none'>,
  { hat: string; scene: string }
> = {
  christmas: {
    // one continuous bent-sock silhouette + fold shade + pompom + band
    hat:
      '<path d="M52,36 C54,20 60,9 71,6 C80,3 88,6 92,12 C95,16 95,21 91,23 C88,17 84,13 79,12 C84,17 88,23 90,30 Z" fill="#E14B4B"/>' +
      '<path d="M79,12 C84,17 88,23 90,30 L85,31 C83,22 81,16 79,12 Z" fill="#C93A3A"/>' +
      '<circle cx="92" cy="24" r="5" fill="#fff"/>' +
      '<path d="M50,37 L92,31" stroke="#fff" stroke-width="9" stroke-linecap="round"/>',
    scene: spark(28, 14, 4, '#EAF4FF') + spark(101, 44, 3, '#EAF4FF'),
  },
  halloween: {
    hat:
      '<g transform="rotate(-8 72 33)">' +
      '<ellipse cx="72" cy="33" rx="26" ry="5.5" fill="#241d3d"/>' +
      '<polygon points="58,33 88,33 76,4" fill="#2c2350"/>' +
      '<rect x="64" y="25" width="18" height="5.5" fill="#443775"/>' +
      '<rect x="70" y="24.5" width="6" height="6.5" fill="#FFD24D"/></g>',
    scene:
      // bat
      '<path d="M14,18 Q20,7 29,11 Q30,5 34,5 Q34,9 36,10 Q38,9 38,5 Q42,5 43,11 Q52,7 58,18 Q50,14 45,18 Q41,14 36,18 Q31,14 27,18 Q22,14 14,18 Z" fill="#8d84b8"/>' +
      // jack-o'-lantern
      '<ellipse cx="30" cy="106" rx="12" ry="9.5" fill="#F28C28"/>' +
      '<ellipse cx="30" cy="106" rx="5" ry="9.5" fill="#E07612"/>' +
      '<rect x="28" y="93" width="4" height="6" fill="#5a7a3a"/>' +
      '<polygon points="24,102 27,106 21,106" fill="#241d3d"/>' +
      '<polygon points="36,102 39,106 33,106" fill="#241d3d"/>' +
      '<polygon points="22,110 26,108 30,111 34,108 38,110 30,114" fill="#241d3d"/>',
  },
  newYear: {
    hat:
      '<polygon points="64,26 86,24 76,2" fill="#FFD24D"/>' +
      '<line x1="70" y1="18" x2="84" y2="17" stroke="#B45309" stroke-width="2.5"/>' +
      '<line x1="67" y1="23" x2="86" y2="21.5" stroke="#B45309" stroke-width="2.5"/>' +
      '<circle cx="76" cy="2" r="3" fill="#FF5C8A"/>',
    scene:
      // firework burst
      '<circle cx="20" cy="14" r="2.5" fill="#FFE891"/>' +
      '<g stroke="#FFD24D" stroke-width="2" stroke-linecap="round">' +
      '<line x1="20" y1="5.5" x2="20" y2="9.5"/><line x1="20" y1="18.5" x2="20" y2="22.5"/>' +
      '<line x1="11.5" y1="14" x2="15.5" y2="14"/><line x1="24.5" y1="14" x2="28.5" y2="14"/>' +
      '<line x1="14" y1="8" x2="16.8" y2="10.8"/><line x1="23.2" y1="17.2" x2="26" y2="20"/>' +
      '<line x1="26" y1="8" x2="23.2" y2="10.8"/><line x1="16.8" y1="17.2" x2="14" y2="20"/></g>' +
      '<circle cx="20" cy="3.5" r="1.8" fill="#FF5C8A"/><circle cx="20" cy="24.5" r="1.8" fill="#8fdcff"/>' +
      '<circle cx="9.5" cy="14" r="1.8" fill="#7CFFB2"/><circle cx="30.5" cy="14" r="1.8" fill="#FFB3C7"/>' +
      '<circle cx="100" cy="12" r="2" fill="#8fdcff"/><circle cx="104" cy="36" r="2" fill="#7CFFB2"/>',
  },
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
    '<circle cx="97" cy="21" r="6.5" fill="#FFD24D"/>' +
    '<circle cx="97" cy="21" r="3" fill="#FFE891"/>' +
    '<g stroke="#FFD24D" stroke-width="2.5" stroke-linecap="round">' +
    '<line x1="97" y1="9" x2="97" y2="12.5"/><line x1="97" y1="29.5" x2="97" y2="33"/>' +
    '<line x1="85" y1="21" x2="88.5" y2="21"/><line x1="105.5" y1="21" x2="109" y2="21"/>' +
    '<line x1="88.5" y1="12.5" x2="91" y2="15"/><line x1="103" y1="27" x2="105.5" y2="29.5"/>' +
    '<line x1="105.5" y1="12.5" x2="103" y2="15"/><line x1="91" y1="27" x2="88.5" y2="29.5"/></g>',
  nightOwl:
    // drowsy: lids at half mast, pupil sagging (beak droop lives in body())
    '<path d="M70,51 A8,8 0 0 0 86,51 Z" fill="#fff"/>' +
    `<circle cx="77" cy="53.5" r="2.4" fill="${PUPIL}"/>` +
    `<line x1="69" y1="48" x2="87" y2="48" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>` +
    // crescent as explicit cubics: arc-pair crescents silently degenerate when
    // the inner radius is under half the chord (androidsvg + browsers alike)
    '<path d="M98,12 C87,14 87,26 98,28 C92,24 92,16 98,12 Z" fill="#CADCFF"/>' +
    spark(84, 12, 3.5, '#E6EEFF') +
    spark(105, 34, 3, '#E6EEFF'),
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

export function maniSvg(pose: ManiPose, season: ManiSeason = 'none'): string {
  const pal =
    pose === 'icy' || pose === 'shivering'
      ? ICE_P
      : pose === 'asleep'
      ? GREY_P
      : PURPLE
  const dressUp =
    season === 'none'
      ? ''
      : (pose === 'party' ? '' : SEASONS[season].hat) + SEASONS[season].scene
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 118">' +
    body(pal, pose === 'nightOwl') +
    FACES[pose] +
    dressUp +
    '</svg>'
  )
}

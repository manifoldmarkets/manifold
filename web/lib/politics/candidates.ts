import {
  CANDIDATE_DATA,
  CandidateDataType,
} from 'web/components/us-elections/ candidates/candidate-data'

// Who an answer on a 2028+ election market is about: a name, a short name for
// tight labels, a party for colour coding, and a photo when we have one.
// Community markets spell the same person many ways ("J.D. Vance", "JD Vance",
// "Ron Desantis", "Jon Ossoff (Georgia Senator)", "Raphael Warnock " with a
// trailing space), so every lookup goes through normalizeCandidateName.

export type CandidateParty = 'D' | 'R' | 'O'

export type CandidateInfo = {
  // Normalized lookup key, stable across spellings.
  key: string
  name: string
  shortName: string
  party?: CandidateParty
  photo?: string
  initials: string
}

const PARTY_CODE: Record<CandidateDataType['party'], CandidateParty> = {
  Democrat: 'D',
  Republican: 'R',
  Other: 'O',
}

// Lowercase, no parenthetical ("(Georgia Senator)"), no punctuation, single
// spaces. Hyphens become spaces so "Ocasio-Cortez" and "Ocasio Cortez" agree.
export function normalizeCandidateName(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[’'`]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// Spellings that normalize differently from the CANDIDATE_DATA key they mean.
// Keys and values are both normalized names.
const ALIASES: Record<string, string> = {
  'j d vance': 'jd vance',
  'donald trump sr': 'donald trump',
  'donald j trump': 'donald trump',
  'donald trump jr': 'donald trump jr',
  'donald j trump jr': 'donald trump jr',
  'jb pritzker': 'j b pritzker',
  aoc: 'alexandria ocasio cortez',
  'robert f kennedy': 'robert f kennedy jr',
  'rfk jr': 'robert f kennedy jr',
  // The Louisiana senator, the only John Kennedy on these markets.
  'john kennedy': 'john n kennedy',
  bernie: 'bernie sanders',
  ivanka: 'ivanka trump',
  mtg: 'marjorie taylor greene',
}

// First spelling wins: CANDIDATE_DATA lists the properly capitalized one
// first ("Ron DeSantis" before the community's "Ron Desantis").
const INDEX = new Map<string, { name: string; data: CandidateDataType }>()
for (const [name, data] of Object.entries(CANDIDATE_DATA)) {
  const key = normalizeCandidateName(name)
  if (!INDEX.has(key)) INDEX.set(key, { name, data })
}

export function initialsOf(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .filter((w) => !/^(jr|sr|ii|iii)\.?$/i.test(w))
  if (words.length === 0) return '?'
  const first = words[0][0]
  const last = words.length > 1 ? words[words.length - 1][0] : ''
  return (first + last).toUpperCase()
}

// The display name for an answer we have no data for: its text without a
// parenthetical, trimmed.
const cleanName = (text: string) =>
  text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function lookupCandidate(answerText: string): CandidateInfo {
  const normalized = normalizeCandidateName(answerText)
  const key = ALIASES[normalized] ?? normalized
  const hit = INDEX.get(key)
  if (hit) {
    return {
      key,
      name: hit.name,
      shortName: hit.data.shortName,
      party: PARTY_CODE[hit.data.party],
      photo: hit.data.photo,
      initials: initialsOf(hit.name),
    }
  }
  const name = cleanName(answerText) || answerText
  const words = name.split(' ')
  return {
    key,
    name,
    shortName: words.length > 1 ? words[words.length - 1] : name,
    initials: initialsOf(name),
  }
}

// Answers that are not a person: the market's catch-all and the jokes.
const NOT_A_CANDIDATE = [
  /^other$/i,
  /^no 2028 election$/i,
  /^no one$/i,
  /^none of the above$/i,
]

export const isCandidateAnswer = (text: string) =>
  !NOT_A_CANDIDATE.some((re) => re.test(text.trim()))

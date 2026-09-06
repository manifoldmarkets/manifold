/**
 * Mock football-data.org API server for testing sports market creation + auto-resolve.
 *
 * Serves 3 TEST-competition matches (WC-style international teams) spaced 45 min apart,
 * with kickoffs beginning 30 min from the script's start time.
 *
 * Usage:
 *   node backend/scripts/mock-sports-server.mjs
 *
 * Then set in your backend environment:
 *   FOOTBALL_DATA_BASE_URL=http://localhost:7891
 *   FOOTBALL_DATA_API_KEY=test-mock-key   (any non-empty value works)
 *
 * Check server/match state at any time:
 *   curl http://localhost:7891/status
 *
 * Timeline (relative to server start):
 *   +30 min  → Match 1 (BRA vs ARG) kicks off → IN_PLAY
 *   +45 min  → Match 1 FINISHED (Argentina wins 2-1)
 *   +75 min  → Match 2 (FRA vs GER) kicks off → IN_PLAY
 *   +90 min  → Match 2 FINISHED (Draw 1-1)
 *   +120 min → Match 3 (ESP vs POR) kicks off → IN_PLAY
 *   +135 min → Match 3 FINISHED (Spain wins 3-0)
 *
 * Match duration is 15 min real-time so the 15-min scheduler will catch each result
 * within one polling cycle after each match ends.
 */

import http from 'http'
import { URL } from 'url'

const PORT = 7891
const MATCH_DURATION_MS = 15 * 60 * 1000 // 15 min real-time per match

// Anchor all kickoffs to server start time so the schedule is always valid
const START = Date.now()
const KICKOFFS = [
  START + 30 * 60 * 1000,   // Match 1: +30 min
  START + 75 * 60 * 1000,   // Match 2: +75 min  (45 min after Match 1)
  START + 120 * 60 * 1000,  // Match 3: +120 min (45 min after Match 2)
]

function isoFromMs(ms) {
  return new Date(ms).toISOString()
}

const BASE_MATCHES = [
  {
    id: 9001,
    matchday: 1,
    stage: 'GROUP_STAGE',
    group: 'GROUP_A',
    kickoffMs: KICKOFFS[0],
    finalScore: { home: 1, away: 2, winner: 'AWAY_TEAM' },
    homeTeam: {
      id: 5001,
      name: 'Brazil',
      shortName: 'Brazil',
      tla: 'BRA',
      crest: 'https://crests.football-data.org/764.svg',
      area: { code: 'BRA' },
    },
    awayTeam: {
      id: 5002,
      name: 'Argentina',
      shortName: 'Argentina',
      tla: 'ARG',
      crest: 'https://crests.football-data.org/762.svg',
      area: { code: 'ARG' },
    },
  },
  {
    id: 9002,
    matchday: 1,
    stage: 'GROUP_STAGE',
    group: 'GROUP_B',
    kickoffMs: KICKOFFS[1],
    finalScore: { home: 1, away: 1, winner: 'DRAW' },
    homeTeam: {
      id: 5003,
      name: 'France',
      shortName: 'France',
      tla: 'FRA',
      crest: 'https://crests.football-data.org/773.svg',
      area: { code: 'FRA' },
    },
    awayTeam: {
      id: 5004,
      name: 'Germany',
      shortName: 'Germany',
      tla: 'GER',
      crest: 'https://crests.football-data.org/759.svg',
      area: { code: 'GER' },
    },
  },
  {
    id: 9003,
    matchday: 1,
    stage: 'GROUP_STAGE',
    group: 'GROUP_C',
    kickoffMs: KICKOFFS[2],
    finalScore: { home: 3, away: 0, winner: 'HOME_TEAM' },
    homeTeam: {
      id: 5005,
      name: 'Spain',
      shortName: 'Spain',
      tla: 'ESP',
      crest: 'https://crests.football-data.org/760.svg',
      area: { code: 'ESP' },
    },
    awayTeam: {
      id: 5006,
      name: 'Portugal',
      shortName: 'Portugal',
      tla: 'POR',
      crest: 'https://crests.football-data.org/765.svg',
      area: { code: 'POR' },
    },
  },
]

function getStatus(match) {
  const now = Date.now()
  if (now < match.kickoffMs) return 'SCHEDULED'
  if (now >= match.kickoffMs + MATCH_DURATION_MS) return 'FINISHED'
  return 'IN_PLAY'
}

function getLiveScore(match) {
  const elapsed = Date.now() - match.kickoffMs
  const progress = Math.min(elapsed / MATCH_DURATION_MS, 1)
  // Goals arrive in the second half of the match for drama
  const homeScore = progress > 0.6 ? match.finalScore.home : Math.floor(match.finalScore.home * progress * 1.2)
  const awayScore = progress > 0.6 ? match.finalScore.away : Math.floor(match.finalScore.away * progress * 1.2)
  return { home: homeScore, away: awayScore }
}

function buildFDMatch(match) {
  const status = getStatus(match)
  const finished = status === 'FINISHED'
  const inPlay = status === 'IN_PLAY'

  let fullTime = { home: null, away: null }
  let halfTime = { home: null, away: null }
  let winner = null

  if (finished) {
    fullTime = { home: match.finalScore.home, away: match.finalScore.away }
    halfTime = { home: 0, away: 0 }
    winner = match.finalScore.winner
  } else if (inPlay) {
    const live = getLiveScore(match)
    fullTime = { home: live.home, away: live.away }
  }

  return {
    id: match.id,
    utcDate: isoFromMs(match.kickoffMs),
    status,
    matchday: match.matchday,
    stage: match.stage,
    group: match.group,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    score: {
      winner,
      duration: 'REGULAR',
      fullTime,
      halfTime,
    },
  }
}

function filterByDate(matches, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return matches
  return matches.filter((m) => {
    const d = new Date(m.utcDate).getTime()
    const from = dateFrom ? new Date(dateFrom).getTime() : 0
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity
    return d >= from && d <= to
  })
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  console.log(`[mock ${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.url}`)

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')

  // GET /v4/competitions/:code/matches — only TEST returns data; others return empty
  const compMatch = path.match(/^\/v4\/competitions\/([^/]+)\/matches$/)
  if (compMatch) {
    const code = compMatch[1]
    if (code !== 'TEST') {
      res.writeHead(200)
      res.end(JSON.stringify({ matches: [], count: 0 }))
      return
    }

    const statusFilter = url.searchParams.get('status')
    const dateFrom = url.searchParams.get('dateFrom')
    const dateTo = url.searchParams.get('dateTo')

    let matches = BASE_MATCHES.map(buildFDMatch)
    if (statusFilter) {
      const statuses = statusFilter.split(',')
      matches = matches.filter((m) => statuses.includes(m.status))
    }
    matches = filterByDate(
      matches,
      dateFrom,
      dateTo
    )

    res.writeHead(200)
    res.end(JSON.stringify({ matches, count: matches.length }))
    return
  }

  // GET /v4/matches/:id
  const matchDetail = path.match(/^\/v4\/matches\/(\d+)$/)
  if (matchDetail) {
    const id = parseInt(matchDetail[1])
    const base = BASE_MATCHES.find((m) => m.id === id)
    if (base) {
      res.writeHead(200)
      res.end(JSON.stringify({ match: buildFDMatch(base) }))
    } else {
      res.writeHead(404)
      res.end(JSON.stringify({ message: 'Match not found' }))
    }
    return
  }

  // GET /status — human-readable status for debugging
  if (path === '/status') {
    const now = Date.now()
    const info = BASE_MATCHES.map((m) => {
      const status = getStatus(m)
      const minUntilKickoff = Math.round((m.kickoffMs - now) / 60000)
      const minUntilEnd = Math.round((m.kickoffMs + MATCH_DURATION_MS - now) / 60000)
      return {
        id: m.id,
        match: `${m.homeTeam.tla} vs ${m.awayTeam.tla}`,
        kickoff: isoFromMs(m.kickoffMs),
        status,
        result: `${m.finalScore.home}-${m.finalScore.away} (${m.finalScore.winner})`,
        minUntilKickoff: minUntilKickoff > 0 ? minUntilKickoff : undefined,
        minUntilFinished: minUntilEnd > 0 ? minUntilEnd : undefined,
      }
    })
    res.writeHead(200)
    res.end(JSON.stringify({ serverTime: new Date().toISOString(), matches: info }, null, 2))
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ message: `Not found: ${path}` }))
})

server.listen(PORT, () => {
  const now = new Date()
  console.log(`\n=== Mock football-data.org server on http://localhost:${PORT} ===`)
  console.log(`Started: ${now.toISOString()}\n`)
  console.log('Match schedule (real-time):')
  BASE_MATCHES.forEach((m) => {
    const kickoffStr = isoFromMs(m.kickoffMs)
    const endStr = isoFromMs(m.kickoffMs + MATCH_DURATION_MS)
    const minFromNow = Math.round((m.kickoffMs - Date.now()) / 60000)
    console.log(
      `  #${m.id}  ${m.homeTeam.tla} vs ${m.awayTeam.tla}  ` +
      `[${m.stage} ${m.group}]  ` +
      `kick=${kickoffStr.slice(11, 16)} UTC  ` +
      `end=${endStr.slice(11, 16)} UTC  ` +
      `(+${minFromNow}min)  ` +
      `result: ${m.finalScore.home}-${m.finalScore.away}`
    )
  })
  console.log(`\nDuration per match: ${MATCH_DURATION_MS / 60000} min real-time`)
  console.log('\nRequired env vars (set before starting backend/scheduler):')
  console.log('  FOOTBALL_DATA_BASE_URL=http://localhost:7891')
  console.log('  FOOTBALL_DATA_API_KEY=test-mock-key\n')
  console.log('Debug: curl http://localhost:7891/status\n')
})

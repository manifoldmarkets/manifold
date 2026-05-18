import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import {
  SportsMatchCard,
  PastMatchCard,
  SportsMatch,
} from 'web/components/sports/sports-match-card'

// ---------------------------------------------------------------------------
// Prototype data — replace with live market data in production
// ---------------------------------------------------------------------------

const UPCOMING: SportsMatch[] = [
  {
    id: 'wc-1',
    teamA: { name: 'USA', flag: '🇺🇸', prob: 62 },
    teamB: { name: 'Mexico', flag: '🇲🇽', prob: 20 },
    draw: { prob: 18 },
    closeTime: '5:00 PM',
    closeTimeMs: Date.now() + 3600000,
    closeDateLabel: 'Jun 12',
    volume: '8.2k',
    status: 'upcoming',
  },
  {
    id: 'wc-2',
    teamA: { name: 'Germany', flag: '🇩🇪', prob: 55 },
    teamB: { name: 'Japan', flag: '🇯🇵', prob: 23 },
    draw: { prob: 22 },
    closeTime: '8:00 PM',
    closeTimeMs: Date.now() + 7200000,
    closeDateLabel: 'Jun 12',
    volume: '3.1k',
    status: 'upcoming',
  },
  {
    id: 'wc-3',
    teamA: { name: 'Spain', flag: '🇪🇸', prob: 61 },
    teamB: { name: 'Morocco', flag: '🇲🇦', prob: 18 },
    draw: { prob: 21 },
    closeTime: '11:00 PM',
    closeTimeMs: Date.now() + 10800000,
    closeDateLabel: 'Jun 12',
    volume: '4.7k',
    status: 'upcoming',
  },
  {
    id: 'wc-4',
    teamA: { name: 'Brazil', flag: '🇧🇷', prob: 58 },
    teamB: { name: 'Serbia', flag: '🇷🇸', prob: 21 },
    draw: { prob: 21 },
    closeTime: '3:00 PM',
    closeTimeMs: Date.now() + 14400000,
    closeDateLabel: 'Jun 13',
    volume: '6.5k',
    status: 'upcoming',
  },
  {
    id: 'wc-5',
    teamA: { name: 'France', flag: '🇫🇷', prob: 63 },
    teamB: { name: 'Australia', flag: '🇦🇺', prob: 15 },
    draw: { prob: 22 },
    closeTime: '6:00 PM',
    closeTimeMs: Date.now() + 18000000,
    closeDateLabel: 'Jun 13',
    volume: '5.1k',
    status: 'upcoming',
  },
  {
    id: 'wc-6',
    teamA: { name: 'Argentina', flag: '🇦🇷', prob: 71 },
    teamB: { name: 'Saudi Arabia', flag: '🇸🇦', prob: 12 },
    draw: { prob: 17 },
    closeTime: '9:00 PM',
    closeTimeMs: Date.now() + 21600000,
    closeDateLabel: 'Jun 13',
    volume: '9.4k',
    status: 'upcoming',
  },
]

const RECENT: SportsMatch[] = [
  {
    id: 'wc-r1',
    teamA: { name: 'Argentina', flag: '🇦🇷', prob: 76 },
    teamB: { name: 'Nigeria', flag: '🇳🇬', prob: 10 },
    draw: { prob: 14 },
    closeTime: '',
    closeTimeMs: 0,
    closeDateLabel: 'Jun 11',
    volume: '12.1k',
    status: 'resolved',
    winner: 'teamA',
  },
  {
    id: 'wc-r2',
    teamA: { name: 'France', flag: '🇫🇷', prob: 54 },
    teamB: { name: 'Denmark', flag: '🇩🇰', prob: 18 },
    draw: { prob: 28 },
    closeTime: '',
    closeTimeMs: 0,
    closeDateLabel: 'Jun 11',
    volume: '6.8k',
    status: 'resolved',
    winner: 'draw',
  },
]

const PAST: SportsMatch[] = [
  {
    id: 'wc-p1',
    teamA: { name: 'Portugal', flag: '🇵🇹', prob: 67 },
    teamB: { name: 'Ghana', flag: '🇬🇭', prob: 12 },
    draw: { prob: 21 },
    closeTime: '',
    closeTimeMs: 0,
    closeDateLabel: 'Jun 9',
    volume: '4.2k',
    status: 'resolved',
    winner: 'teamA',
  },
  {
    id: 'wc-p2',
    teamA: { name: 'South Korea', flag: '🇰🇷', prob: 35 },
    teamB: { name: 'Cameroon', flag: '🇨🇲', prob: 38 },
    draw: { prob: 27 },
    closeTime: '',
    closeTimeMs: 0,
    closeDateLabel: 'Jun 9',
    volume: '2.8k',
    status: 'resolved',
    winner: 'draw',
  },
  {
    id: 'wc-p3',
    teamA: { name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', prob: 72 },
    teamB: { name: 'Iran', flag: '🇮🇷', prob: 11 },
    draw: { prob: 17 },
    closeTime: '',
    closeTimeMs: 0,
    closeDateLabel: 'Jun 8',
    volume: '9.3k',
    status: 'resolved',
    winner: 'teamA',
  },
  {
    id: 'wc-p4',
    teamA: { name: 'Senegal', flag: '🇸🇳', prob: 29 },
    teamB: { name: 'Netherlands', flag: '🇳🇱', prob: 52 },
    draw: { prob: 19 },
    closeTime: '',
    closeTimeMs: 0,
    closeDateLabel: 'Jun 8',
    volume: '3.7k',
    status: 'resolved',
    winner: 'teamB',
  },
]

// ---------------------------------------------------------------------------
// Group upcoming matches by date for section headers
// ---------------------------------------------------------------------------

type DateSection = { label: string; matches: SportsMatch[] }

function groupByDate(matches: SportsMatch[]): DateSection[] {
  const map = new Map<string, SportsMatch[]>()
  for (const match of matches) {
    const key = match.closeDateLabel
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(match)
  }
  return Array.from(map.entries()).map(([label, m]) => ({ label, matches: m }))
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorldCupDashboard() {
  const [pastVisible, setPastVisible] = useState(true)
  const upcomingSections = groupByDate(UPCOMING)

  // For the prototype the first date section is labeled "Today"
  const todayLabel = upcomingSections[0]?.label

  return (
    <Page trackPageView="world cup dashboard">
      <Col className="mx-auto w-full max-w-5xl gap-8 px-4 py-6 sm:px-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <Row className="border-ink-200 items-center gap-3 border-b pb-5">
          <span className="text-2xl">⚽</span>
          <h1 className="text-ink-1000 text-xl font-medium tracking-tight">
            FIFA World Cup 2026
          </h1>
        </Row>

        {/* ── Upcoming — grouped by date ──────────────────────────────── */}
        {upcomingSections.map(({ label, matches }, i) => (
          <Col key={label} className="gap-3">
            <Row className="items-center gap-2.5">
              <span className="text-ink-1000 text-base font-medium">
                {i === 0 ? `Today — ${label}` : label}
              </span>
              <span className="text-ink-500 text-xs">
                {matches.length} match{matches.length !== 1 ? 'es' : ''}
              </span>
            </Row>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {matches.map((match) => (
                <SportsMatchCard key={match.id} match={match} />
              ))}
            </div>
          </Col>
        ))}

        {/* ── Recent resolved ────────────────────────────────────────── */}
        {RECENT.length > 0 && (
          <Col className="gap-3">
            <Row className="items-center gap-2.5">
              <span className="text-ink-1000 text-base font-medium">
                Recent
              </span>
              <span className="text-ink-500 text-xs">
                {RECENT.length} resolved
              </span>
            </Row>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {RECENT.map((match) => (
                <SportsMatchCard key={match.id} match={match} />
              ))}
            </div>
          </Col>
        )}

        {/* ── Past games ─────────────────────────────────────────────── */}
        {PAST.length > 0 && (
          <Col className="border-ink-200 gap-3 border-t pt-6">
            <Row className="items-center gap-2.5">
              <span className="text-ink-500 text-sm font-medium">
                Past games
              </span>
              <button
                onClick={() => setPastVisible((v) => !v)}
                className="border-ink-200 text-ink-500 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs transition-colors"
              >
                {pastVisible ? 'hide' : 'show'}
              </button>
            </Row>
            {pastVisible && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PAST.map((match) => (
                  <PastMatchCard key={match.id} match={match} />
                ))}
              </div>
            )}
          </Col>
        )}

      </Col>
    </Page>
  )
}

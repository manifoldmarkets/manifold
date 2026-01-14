import clsx from 'clsx'
import { range, sortBy } from 'lodash'

import { DIVISION_NAMES, prizesByDivisionAndRank } from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { DIVISION_STYLES } from './division-badge'

export function PrizesModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const divisions = sortBy(
    Object.entries(DIVISION_NAMES).filter(([division]) => +division > 0),
    ([division]) => division
  )

  return (
    <Modal open={open} setOpen={setOpen} size={'lg'}>
      <Col className="bg-canvas-0 text-ink-1000 gap-0 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-yellow-500 to-orange-500 px-6 py-8">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
          
          <Col className="relative z-10 items-center gap-2">
            <span className="text-5xl">🏆</span>
            <h2 className="text-2xl font-black text-white">Season Prizes</h2>
            <p className="text-center text-sm text-amber-100">
              Win mana at the end of the season based on your division and finishing rank
            </p>
          </Col>
        </div>

        {/* Prizes Grid */}
        <Col className="gap-4 p-4">
          {divisions.map(([divisionNum, divisionName]) => {
            const div = +divisionNum
            const style = DIVISION_STYLES[div] ?? DIVISION_STYLES[1]
            const prizes = prizesByDivisionAndRank[div - 1] ?? []

            return (
              <Col key={div} className="gap-2">
                {/* Division Header */}
                <Row className="items-center gap-2">
                  <span className="text-xl">{style.icon}</span>
                  <span className={clsx('font-bold', style.text)}>
                    {divisionName}
                  </span>
                </Row>

                {/* Prizes Row */}
                <Row className="scrollbar-hide -mx-4 gap-2 overflow-x-auto px-4 pb-2">
                  {prizes.map((prize, idx) => (
                    <PrizeCard
                      key={idx}
                      rank={idx + 1}
                      prize={prize}
                      divisionStyle={style}
                    />
                  ))}
                </Row>
              </Col>
            )
          })}
        </Col>

        {/* Footer */}
        <div className="bg-ink-100 px-6 py-4 text-center">
          <span className="text-ink-600 text-sm">
            Top performers in higher divisions earn more! 💪
          </span>
        </div>
      </Col>
    </Modal>
  )
}

function PrizeCard(props: {
  rank: number
  prize: number
  divisionStyle: (typeof DIVISION_STYLES)[number]
}) {
  const { rank, prize, divisionStyle } = props

  const getRankDisplay = () => {
    if (rank === 1) return { emoji: '🥇', label: '1st' }
    if (rank === 2) return { emoji: '🥈', label: '2nd' }
    if (rank === 3) return { emoji: '🥉', label: '3rd' }
    return { emoji: '', label: `${rank}th` }
  }

  const rankDisplay = getRankDisplay()
  const isTopThree = rank <= 3

  return (
    <Col
      className={clsx(
        'shrink-0 items-center gap-1 rounded-xl p-3',
        'border transition-all',
        isTopThree
          ? `${divisionStyle.bg} ${divisionStyle.border} shadow-md`
          : 'border-ink-200 bg-canvas-50'
      )}
      style={{ minWidth: 70 }}
    >
      <span className="text-lg">{rankDisplay.emoji || rankDisplay.label}</span>
      {rankDisplay.emoji && (
        <span className="text-ink-500 text-xs">{rankDisplay.label}</span>
      )}
      <span
        className={clsx(
          'font-bold tabular-nums',
          isTopThree ? divisionStyle.text : 'text-ink-700'
        )}
      >
        {formatMoney(prize)}
      </span>
    </Col>
  )
}

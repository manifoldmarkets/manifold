import clsx from 'clsx'
import { sortBy } from 'lodash'

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
    <Modal open={open} setOpen={setOpen} size="lg">
      <Col className="bg-canvas-0 text-ink-1000 gap-0 overflow-hidden rounded-lg">
        {/* Header */}
        <div className="border-ink-200 border-b px-6 py-5">
          <h2 className="text-ink-900 text-lg font-semibold">Season Prizes</h2>
          <p className="text-ink-500 mt-1 text-sm">
            Prizes awarded at the end of each season based on your division and
            final rank
          </p>
        </div>

        {/* Prizes Grid */}
        <Col className="max-h-[60vh] gap-6 overflow-y-auto p-6">
          {divisions.map(([divisionNum, divisionName]) => {
            const div = +divisionNum
            const style = DIVISION_STYLES[div] ?? DIVISION_STYLES[1]
            const prizes = prizesByDivisionAndRank[div - 1] ?? []

            return (
              <Col key={div} className="gap-3">
                {/* Division Header */}
                <Row className="items-center gap-2">
                  <div
                    className={clsx(
                      'flex h-6 w-6 items-center justify-center rounded text-xs font-semibold',
                      style.bg,
                      style.border,
                      style.text,
                      'border'
                    )}
                  >
                    {div}
                  </div>
                  <span className="text-ink-900 font-medium">
                    {divisionName}
                  </span>
                </Row>

                {/* Prizes Row */}
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {prizes.map((prize, idx) => (
                    <PrizeCard
                      key={idx}
                      rank={idx + 1}
                      prize={prize}
                      isTopThree={idx < 3}
                    />
                  ))}
                </div>
              </Col>
            )
          })}
        </Col>

        {/* Footer */}
        <div className="border-ink-200 bg-canvas-50 border-t px-6 py-4">
          <p className="text-ink-500 text-center text-sm">
            Higher divisions offer larger prizes for top performers
          </p>
        </div>
      </Col>
    </Modal>
  )
}

function PrizeCard(props: {
  rank: number
  prize: number
  isTopThree: boolean
}) {
  const { rank, prize, isTopThree } = props

  const getRankLabel = () => {
    if (rank === 1) return '1st'
    if (rank === 2) return '2nd'
    if (rank === 3) return '3rd'
    return `${rank}th`
  }

  return (
    <Col
      className={clsx(
        'items-center gap-0.5 rounded-md p-2 text-center',
        isTopThree ? 'bg-primary-50 border-primary-200 border' : 'bg-canvas-50'
      )}
    >
      <span
        className={clsx(
          'text-xs font-medium',
          isTopThree ? 'text-primary-700' : 'text-ink-500'
        )}
      >
        {getRankLabel()}
      </span>
      <span
        className={clsx(
          'text-sm font-semibold tabular-nums',
          isTopThree ? 'text-primary-700' : 'text-ink-700'
        )}
      >
        {formatMoney(prize)}
      </span>
    </Col>
  )
}

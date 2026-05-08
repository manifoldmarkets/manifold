import clsx from 'clsx'
import { BOOST_CONTRACT_SUBSIDY_MANA } from 'common/boost'
import { BOOST_COST_MANA } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { BsRocketTakeoff } from 'react-icons/bs'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import ShortToggle from 'web/components/widgets/short-toggle'

export function BoostSection(props: {
  enabled: boolean
  setEnabled: (value: boolean) => void
  visibility: 'public' | 'unlisted'
  className?: string
}) {
  const { enabled, setEnabled, visibility, className } = props
  const isUnlisted = visibility !== 'public'

  return (
    <Col
      className={clsx(
        'bg-canvas-0 ring-ink-100 gap-3 rounded-lg p-4 shadow-sm ring-1',
        isUnlisted && 'opacity-60',
        className
      )}
    >
      <Row className="items-start justify-between gap-3">
        <Col className="gap-1">
          <Row className="items-center gap-2">
            <BsRocketTakeoff className="text-primary-600 h-5 w-5" />
            <span className="text-ink-900 text-sm font-semibold">
              Boost this market
            </span>
            <span className="text-ink-500 text-xs">
              + {formatMoney(BOOST_COST_MANA)}
            </span>
          </Row>
          <p className="text-ink-600 text-sm">
            Featured on the homepage for 24 hours, putting your market in front
            of more traders. Boosted markets get more participation, which
            tightens pricing and produces a more accurate forecast. Includes{' '}
            {formatMoney(BOOST_CONTRACT_SUBSIDY_MANA)} extra in subsidy.
          </p>
          {isUnlisted && (
            <p className="text-ink-500 text-xs italic">
              Boosting is only available for publicly listed markets.
            </p>
          )}
        </Col>
        <ShortToggle
          on={enabled && !isUnlisted}
          setOn={setEnabled}
          disabled={isUnlisted}
        />
      </Row>
    </Col>
  )
}

import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { useState } from 'react'

import { useAPIGetter } from 'web/hooks/use-api-getter'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Content } from '../widgets/editor'

export function MarketContext(props: { contractId: string }) {
  const { contractId } = props
  const [expanded, setExpanded] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  const { data, error } = useAPIGetter(
    'get-market-context',
    { contractId },
    undefined,
    `get-market-context-${contractId}`, // unique cache key per market
    hasLoaded // enabled - only fetch when user has clicked
  )

  const loading = hasLoaded && !data && !error
  const context = data?.context

  const handleClick = () => {
    if (!hasLoaded) {
      setHasLoaded(true)
    }
    setExpanded(!expanded)
  }

  return (
    <Col className="border-ink-200 -mx-1 mt-2 w-full rounded-lg border p-3">
      <Row className="w-full items-center justify-between">
        <span className="font-semibold">Market context</span>
        <Button
          loading={loading}
          disabled={loading}
          color="gray-white"
          onClick={handleClick}
          className="-mr-2 self-end"
        >
          {loading ? 'Generating' : expanded ? '' : context ? '' : 'Generate'}
          {!context ? null : expanded ? (
            <ChevronUpIcon className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDownIcon className="ml-1 h-4 w-4" />
          )}
        </Button>
      </Row>
      {expanded && (context || error || data) && (
        <div className={clsx(' border-ink-200 mt-2  py-2', 'text-ink-700')}>
          {error && (
            <p className="text-scarlet-500">
              Failed to load context. Please try again later.
            </p>
          )}

          {context && <Content size="sm" content={context} />}

          {data && !context && (
            <p className="text-ink-500 italic">
              No additional context available for this market.
            </p>
          )}
        </div>
      )}
    </Col>
  )
}

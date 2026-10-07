import { LinkIcon, XIcon } from '@heroicons/react/solid'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Contract, contractPath } from 'common/contract'
import {
  MARKET_LINK_RELATION_LABELS,
  MarketLinkRelation,
} from 'common/market-links'
import { removeEmojis } from 'common/util/string'
import { SelectMarkets } from 'web/components/contract-select-modal'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { useAPIGetter } from 'web/hooks/use-api-getter'

/**
 * "This is about…": the market a new market is linked to. A linked market
 * shows next to that one (under a game on /sports, for example) and closes
 * when it does, unless the creator picks another close time.
 */
export function LinkedMarketField(props: {
  contractId: string | undefined
  relation: MarketLinkRelation | undefined
  onChange: (
    link: { contractId: string; relation: MarketLinkRelation } | undefined
  ) => void
  /** The linked market, once loaded: its close time becomes the default. */
  onParentLoaded: (parent: Contract) => void
}) {
  const { contractId, relation = 'related', onChange, onParentLoaded } = props
  const [picking, setPicking] = useState(false)
  const { data } = useAPIGetter(
    'markets-by-ids',
    { ids: contractId ? [contractId] : [] },
    undefined,
    `create-linked-${contractId ?? 'none'}`,
    !!contractId
  )
  const parent = contractId ? data?.find((c) => c.id === contractId) : undefined
  useEffect(() => {
    if (parent) onParentLoaded(parent)
  }, [parent?.id])

  const pick = (contracts: Contract[]) => {
    setPicking(false)
    const picked = contracts[0]
    if (!picked) return
    const closed =
      !!picked.resolution ||
      (!!picked.closeTime && picked.closeTime <= Date.now())
    if (closed) {
      toast.error('Pick a market that is still open.')
      return
    }
    onChange({ contractId: picked.id, relation })
  }

  return (
    <>
      {contractId ? (
        <Col className="border-ink-200 bg-canvas-0 gap-2 rounded-lg border px-3 py-2.5">
          <Row className="items-start gap-2">
            <LinkIcon className="text-ink-400 mt-0.5 h-4 w-4 shrink-0" />
            <Col className="min-w-0 flex-1 gap-0.5">
              <span className="text-ink-500 text-xs">This market is about</span>
              {parent ? (
                <a
                  href={contractPath(parent)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-900 hover:text-primary-700 truncate text-sm font-medium"
                >
                  {removeEmojis(parent.question)}
                </a>
              ) : data ? (
                <span className="text-scarlet-600 text-sm">
                  That market wasn't found. Remove the link or pick another.
                </span>
              ) : (
                <div className="bg-ink-100 h-5 w-2/3 animate-pulse rounded" />
              )}
              {parent?.closeTime && (
                <span className="text-ink-500 text-xs">
                  Closes {dayjs(parent.closeTime).format('ddd, MMM D, h:mma')}
                </span>
              )}
            </Col>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="text-primary-700 hover:bg-primary-50 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
            >
              Change
            </button>
            <button
              type="button"
              aria-label="Remove the link"
              onClick={() => onChange(undefined)}
              className="text-ink-400 hover:text-ink-700 shrink-0 rounded p-0.5"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </Row>
          <Row className="items-center gap-2 pl-6">
            <span className="text-ink-500 text-xs">It's a</span>
            <ChoicesToggleGroup
              currentChoice={relation}
              choicesMap={Object.fromEntries(
                Object.entries(MARKET_LINK_RELATION_LABELS).map(
                  ([value, label]) => [label, value]
                )
              )}
              setChoice={(value) =>
                onChange({
                  contractId,
                  relation: value as MarketLinkRelation,
                })
              }
              toggleClassName="!px-2 !py-0.5 text-xs"
            />
          </Row>
        </Col>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-ink-500 hover:text-primary-700 border-ink-200 hover:border-primary-300 flex w-fit items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          Link to the market this is about
        </button>
      )}
      <Modal open={picking} setOpen={setPicking} size="lg">
        <Col className="bg-canvas-0 gap-2 rounded-md p-4">
          <span className="text-ink-900 text-base font-semibold">
            What market is this about?
          </span>
          <span className="text-ink-500 text-sm">
            Your market will show next to it, and close when it does.
          </span>
          <SelectMarkets
            maxSelections={1}
            publicOnly
            submitLabel={() => 'Link'}
            onSubmit={pick}
            onCancel={() => setPicking(false)}
            additionalFilter={{
              excludeContractIds: contractId ? [contractId] : [],
            }}
          />
        </Col>
      </Modal>
    </>
  )
}

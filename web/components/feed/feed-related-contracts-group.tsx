import { FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { orderBy, uniqBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { Col } from 'web/components/layout/col'
import { ContractsTable } from 'web/components/contract/contracts-table'
import { CategoryTags } from 'web/components/feed/feed-timeline-items'
import { FeedItemFrame } from 'web/components/feed/feed-item-frame'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Row } from '../layout/row'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'
import { maybePluralize } from 'common/util/format'
const SHOW_CONTRACTS_DEFAULT = 2
export const FeedRelatedContractsGroup = (props: {
  item: FeedTimelineItem
}) => {
  const { item } = props
  const { contract, relatedItems } = item
  const [contractsToShow, setContractsToShow] = useState(SHOW_CONTRACTS_DEFAULT)
  if (!relatedItems) return null
  const contracts = orderBy(
    filterDefined([contract, ...relatedItems.map((i) => i.contract)]),
    'createdTime'
  )
  const extraItems = contracts.length - SHOW_CONTRACTS_DEFAULT
  const questions = maybePluralize('question', extraItems)
  return (
    <FeedItemFrame
      item={item}
      moreItems={relatedItems}
      className="bg-canvas-0 border-canvas-0  w-full overflow-hidden rounded-2xl border shadow-md"
    >
      <Col className="px-2 pt-3">
        <ContractsTable
          contracts={contracts.slice(0, contractsToShow)}
          hideHeader={true}
        />
        {contracts.length > SHOW_CONTRACTS_DEFAULT && (
          <Row className={'mr-1 justify-end'}>
            <Button
              color={'gray-white'}
              onClick={() =>
                setContractsToShow(
                  contractsToShow === SHOW_CONTRACTS_DEFAULT
                    ? contracts.length
                    : SHOW_CONTRACTS_DEFAULT
                )
              }
            >
              {contractsToShow === SHOW_CONTRACTS_DEFAULT ? (
                <ChevronDownIcon className="mr-1 h-4 w-4" />
              ) : (
                <ChevronUpIcon className="mr-1 h-4 w-4" />
              )}
              {contractsToShow === SHOW_CONTRACTS_DEFAULT
                ? `Show ${extraItems} more related ${questions}`
                : `Hide ${extraItems} related ${questions}`}
            </Button>
          </Row>
        )}
      </Col>
      <CategoryTags
        categories={uniqBy(
          contracts.map((c) => c.groupLinks ?? []).flat(),
          'slug'
        )}
        className="mx-4 mb-3"
      />
    </FeedItemFrame>
  )
}

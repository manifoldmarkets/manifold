import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { Button } from 'web/components/buttons/button'
import { Row } from 'web/components/layout/row'

export function ShowMoreLessButton(props: {
  showMore: boolean
  onClick: () => void
}) {
  const { showMore, onClick } = props

  return (
    <Button color={'gray-white'} onClick={onClick} className="mt-2">
      <Row className={'items-center'}>
        {showMore ? (
          <ChevronUpIcon className="mr-1 h-4 w-4" />
        ) : (
          <ChevronDownIcon className="mr-1 h-4 w-4" />
        )}
        {showMore ? 'Show less' : 'Show more'}
      </Row>
    </Button>
  )
}

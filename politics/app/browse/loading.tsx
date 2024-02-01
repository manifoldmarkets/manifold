import LoadingContractRows from 'politics/components/loading-contract-rows'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { IconButton } from 'web/components/buttons/button'
import { XIcon } from '@heroicons/react/outline'

export default function LoadingResults() {
  return (
    <Col className={'max-w-[1440px] lg:grid lg:grid-cols-12'}>
      <div className="lg:col-span-2 lg:flex" />
      <Col className={'mt-6 w-full lg:col-span-10'}>
        <Row className={'relative'}>
          <input
            type="text"
            inputMode="search"
            placeholder={'Search questions'}
            className=": 'border-ink-300  h-12 w-full rounded-md border px-4"
          />
          <IconButton
            className={'absolute right-2 top-1/2 -translate-y-1/2'}
            size={'2xs'}
          >
            <XIcon className={'h-5 w-5 rounded-full'} />
          </IconButton>
        </Row>
        <LoadingContractRows />
      </Col>
    </Col>
  )
}

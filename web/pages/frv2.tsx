import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { test } from 'common/calculate-cpmm-multi'

export default function FRV2() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    test()
  }, [count])

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Row className="mt-4 items-start justify-between sm:mt-0">
          <Title className="mx-4 !mb-0 sm:mx-0" children="Free response V2" />
        </Row>
        <Button onClick={() => setCount(count + 1)}>Run again</Button>
      </Col>
    </Page>
  )
}

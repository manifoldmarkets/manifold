import { contractPath } from 'common/contract'
import { formatMoney } from 'common/util/format'
import Router from 'next/router'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Input } from 'web/components/widgets/input'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { createDebate } from 'web/lib/firebase/api'

const Debate = () => {
  return (
    <Page>
      <SEO
        title="Debate"
        description="Debate the big questions"
        url="/debate"
      />
      <Col>
        <Title>Manifold Debate</Title>

        <CreateDebateWidget />
      </Col>
    </Page>
  )
}

const CreateDebateWidget = () => {
  const [topic1, setTopic1] = useState<string>('')
  const [topic2, setTopic2] = useState<string>('')

  const isValid = topic1 && topic2

  const onCreate = () => {
    if (isValid)
      createDebate({ topic1, topic2 }).then((data) => {
        console.log('hello, market created', data)
        Router.replace(contractPath(data)).catch((e) => {
          console.log(e)
        })
      })
  }

  return (
    <Col>
      <Subtitle className="!mb-4">Create a debate</Subtitle>

      <Col className="max-w-[200px] gap-4">
        <Col>
          <label className="px-1 pb-3">
            Topic 1<span className={'text-scarlet-500 text-sm'}>*</span>
          </label>

          <Input
            placeholder="e.g. Elon Musk"
            autoFocus
            maxLength={140}
            value={topic1}
            onChange={(e) => setTopic1(e.target.value ?? '')}
          />
        </Col>
        <div className="self-center text-2xl">vs.</div>
        <Col>
          <label className="px-1 pb-3">
            Topic 2<span className={'text-scarlet-500 text-sm'}>*</span>
          </label>
          <Input
            placeholder="e.g. Bill Gates"
            autoFocus
            maxLength={140}
            value={topic2}
            onChange={(e) => setTopic2(e.target.value ?? '')}
          />
        </Col>

        <Col className="mt-6 gap-2">
          <div>Cost: {formatMoney(50)}</div>
          <div>Duration: 1 hour</div>
        </Col>
        <Button onClick={onCreate} disabled={!isValid}>
          Start debate
        </Button>
      </Col>
    </Col>
  )
}

export default Debate

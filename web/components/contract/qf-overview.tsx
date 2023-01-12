import { QuadraticFundingContract } from 'common/contract'
import { Col } from '../layout/col'
import { Title } from '../widgets/title'
import Image from 'next/image'
import { formatMoney } from 'common/util/format'
import { Input } from '../widgets/input'
import { Button } from '../buttons/button'
import { useState } from 'react'
import { Spacer } from '../layout/spacer'
import { createQfAnswer } from 'web/lib/firebase/api'

export function QFOverview(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const match = formatMoney(contract.pool.M$)

  return (
    <Col>
      <div className="flex gap-2">
        <Image
          alt=""
          width={100}
          height={100}
          src={contract.coverImageUrl ?? ''}
          className="rounded-md"
        />
        <div className="flex grow justify-between gap-4">
          <Title className="!my-0">{contract.question}</Title>
          <span className="text-4xl">{match}</span>
        </div>
      </div>

      {/* Show a graph for the trades */}
      {/* <SizedContainer fullHeight={250} mobileHeight={150}>
        {(w, h) => (
          <CertContractChart
            width={w}
            height={h}
            certPoints={certPoints}
            cert={contract}
          />
        )}
      </SizedContainer> */}

      {/* Show a div for each provided answer */}
      {contract.answers.map((answer) => (
        <div>
          {answer.text} by @{answer.username}
        </div>
      ))}

      <Spacer h={8} />

      {/* <BuySellWidget contract={contract} /> */}
      <CreateAnswerWidget contract={contract} />
    </Col>
  )
}

function CreateAnswerWidget(props: { contract: QuadraticFundingContract }) {
  const { contract } = props
  const [answer, setAnswer] = useState('')

  // Return a form with a button to create an answer
  return (
    <Col>
      <Input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Answer"
      />
      <Button
        color="gradient"
        onClick={async () => {
          await createQfAnswer({
            qfId: contract.id,
            text: answer,
          })
          // Clear the input
          setAnswer('')
        }}
      >
        Create Answer
      </Button>
    </Col>
  )
}

import { MAX_DESCRIPTION_LENGTH, MAX_QUESTION_LENGTH } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { useEffect, useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { AmountInput } from 'web/components/widgets/amount-input'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { Subtitle } from 'web/components/widgets/subtitle'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { createQAndA } from 'web/lib/firebase/api'
import { db } from 'web/lib/supabase/db'

export default function QuestionAndAnswer() {
  const qs = useQAndA()
  return (
    <Page>
      {qs.map((q: any) => (
        <QuestionAnswer key={q.id} q={q} as={[{ text: 'hi' }]} />
      ))}
      <CreateQAndA />
    </Page>
  )
}

const useQAndA = () => {
  const [questions, setQAndA] = usePersistentInMemoryState<any>([], 'q-and-a')
  useEffect(() => {
    db.from('q_and_a')
      .select('*')
      .then(({ data }) => {
        console.log('rows', data)
        if (data) setQAndA(data)
      })
  }, [])

  return questions
}

function QuestionAnswer(props: { q: any; as: any[] }) {
  const { q, as } = props
  return (
    <Col className="gap-1">
      <Col className="bg-canvas-0 px-3 py-1.5 shadow">
        <div>{q.question}</div>
        <div>{q.description}</div>
      </Col>
      <Col className="ml-12">
        {as.map((a: any) => (
          <Col className="">
            <div>{a.text}</div>
          </Col>
        ))}
      </Col>
    </Col>
  )
}

function CreateQAndA() {
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [bounty, setBounty] = useState<number | undefined>(50)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValid = question.length > 0 && bounty !== undefined && bounty > 0

  const submit = async () => {
    if (!isValid) return

    setIsSubmitting(true)
    await createQAndA({ question, description, bounty })
    setIsSubmitting(false)
  }

  return (
    <Col className="mx-auto w-full max-w-lg gap-4 pb-8 pt-2 sm:pt-0">
      <Subtitle>Create question</Subtitle>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">
          Question<span className={'text-scarlet-500'}>*</span>
        </label>

        <ExpandingInput
          placeholder="e.g. What book should I read next?"
          autoFocus
          maxLength={MAX_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value || '')}
        />
      </Col>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">Description</label>

        <ExpandingInput
          placeholder="e.g. I enjoy Sci-Fi and Fantasy books, and recently read Dune."
          autoFocus
          rows={2}
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={description}
          onChange={(e) => setDescription(e.target.value || '')}
        />
      </Col>

      <Col className="w-full">
        <label className="px-1 pt-2 pb-3">Bounty (paid now)</label>
        <AmountInput
          label={ENV_CONFIG.moneyMoniker}
          amount={bounty}
          onChange={setBounty}
          disabled={isSubmitting}
        />
      </Col>

      <Button
        className="mt-4 w-full"
        type="submit"
        color="indigo"
        size="xl"
        loading={isSubmitting}
        disabled={!isValid}
        onClick={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {isSubmitting ? 'Creating...' : 'Create question'}
      </Button>
    </Col>
  )
}

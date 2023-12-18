import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { PlusIcon, XIcon } from '@heroicons/react/outline'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { useUser } from 'web/hooks/use-user'
import { User } from 'common/user'
import { useEvent } from 'web/hooks/use-event'
import { track } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { createLoveCompatibilityQuestion } from 'web/lib/firebase/love/api'
import { Row as rowFor } from 'common/supabase/utils'
import { AnswerCompatibilityQuestionContent } from './answer-compatibility-question-content'
import { uniq } from 'lodash'
import { QuestionWithCountType } from 'love/hooks/use-questions'
import { MAX_COMPATIBILITY_QUESTION_LENGTH } from 'common/love/constants'

export function AddCompatibilityQuestionButton(props: {
  refreshCompatibilityAll: () => void
}) {
  const { refreshCompatibilityAll } = props
  const [open, setOpen] = useState(false)
  const user = useUser()
  if (!user) return null
  return (
    <>
      <span
        onClick={() => setOpen(true)}
        className="text-primary-500 cursor-pointer text-sm transition-all hover:underline"
      >
        Submit your own compatibility question
      </span>
      <AddCompatibilityQuestionModal
        open={open}
        setOpen={setOpen}
        user={user}
        onClose={() => {
          refreshCompatibilityAll()
        }}
      />
    </>
  )
}

function AddCompatibilityQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  onClose?: () => void
}) {
  const { open, setOpen, user, onClose } = props
  const [dbQuestion, setDbQuestion] = useState<rowFor<'love_questions'> | null>(
    null
  )
  const afterAddQuestion = (newQuestion: rowFor<'love_questions'>) => {
    setDbQuestion(newQuestion)
  }

  return (
    <Modal open={open} setOpen={setOpen} onClose={onClose}>
      <Col className={MODAL_CLASS}>
        {!dbQuestion ? (
          <CreateCompatibilityModalContent
            afterAddQuestion={afterAddQuestion}
            setOpen={setOpen}
          />
        ) : (
          <AnswerCompatibilityQuestionContent
            compatibilityQuestion={dbQuestion as QuestionWithCountType}
            user={user}
            onSubmit={() => {
              setOpen(false)
              setDbQuestion(null)
            }}
            isLastQuestion
            onNext={() => {
              setOpen(false)
              setDbQuestion(null)
            }}
          />
        )}
      </Col>
    </Modal>
  )
}

function CreateCompatibilityModalContent(props: {
  afterAddQuestion: (question: rowFor<'love_questions'>) => void
  setOpen: (open: boolean) => void
}) {
  const { afterAddQuestion, setOpen } = props
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [loading, setLoading] = useState(false)

  const onOptionChange = (index: number, value: string) => {
    const newOptions = [...options]
    newOptions[index] = value
    setOptions(newOptions)
  }

  const addOption = () => {
    setOptions([...options, ''])
  }

  const deleteOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index)
    setOptions(newOptions)
  }

  const optionsAreValid =
    options.every((o) => o.trim().length > 0) && options.length >= 2

  const questionIsValid = question.trim().length > 0

  const noRepeatOptions = uniq(options).length == options.length

  const generateJson = () => {
    const jsonObject = options.reduce((obj, item, index) => {
      if (item.trim() !== '') {
        obj[item] = index // Mapping each option to its index
      }
      return obj
    }, {} as Record<string, number>) // Note the change in the generic type
    return jsonObject
  }

  const onAddQuestion = useEvent(async () => {
    try {
      const newQuestion = await createLoveCompatibilityQuestion({
        question: question,
        options: generateJson(),
      })
      if (
        newQuestion &&
        newQuestion.status == 'success' &&
        newQuestion.question
      ) {
        afterAddQuestion(newQuestion.question as rowFor<'love_questions'>)
      }
      track('create love compatibilty question')
    } catch (e) {
      toast.error('Error creating compatibility question. Try again?')
    }
  })

  return (
    <Col className="w-full gap-4">
      <Col className="gap-1">
        <label>
          Question<span className={'text-scarlet-500'}>*</span>
        </label>
        <ExpandingInput
          maxLength={MAX_COMPATIBILITY_QUESTION_LENGTH}
          value={question}
          onChange={(e) => setQuestion(e.target.value || '')}
        />
      </Col>
      <Col className="gap-1">
        <label>
          Options<span className={'text-scarlet-500'}>*</span>
        </label>
        <Col className="w-full gap-1">
          {options.map((o, index) => (
            <div key={index} className="relative">
              <ExpandingInput
                value={options[index]}
                onChange={(e) => onOptionChange(index, e.target.value)}
                className="w-full"
                placeholder={`Option ${index + 1}`}
                rows={1}
                maxLength={MAX_ANSWER_LENGTH}
              />
              {options.length > 2 && (
                <button
                  className="bg-ink-400 text-ink-0 hover:bg-ink-600 transition-color absolute -right-1.5 -top-1.5 rounded-full p-0.5"
                  onClick={() => deleteOption(index)}
                >
                  <XIcon className="z-10 h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <Button onClick={addOption} color="gray-outline">
            <Row className="items-center gap-1">
              <PlusIcon className="h-4 w-4" />
              Add Option
            </Row>
          </Button>
        </Col>
      </Col>

      <Row className="w-full justify-between">
        <Button
          color="gray"
          onClick={() => {
            setOpen(false)
          }}
        >
          Cancel
        </Button>
        <Button
          loading={loading}
          onClick={() => {
            setLoading(true)
            onAddQuestion().finally(() => setLoading(false))
          }}
          disabled={!optionsAreValid || !questionIsValid || !noRepeatOptions}
        >
          Submit & Answer
        </Button>
      </Row>
    </Col>
  )
}

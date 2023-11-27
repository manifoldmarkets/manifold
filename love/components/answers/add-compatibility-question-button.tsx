import { MAX_QUESTION_LENGTH } from 'common/contract'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { PlusIcon, XIcon } from '@heroicons/react/outline'
import { MAX_ANSWER_LENGTH } from 'common/answer'

export function AddCompatibilityQuestionButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} color="gray-outline">
        <Row className="items-center gap-1">
          <PlusIcon className="h-4 w-4" />
          Add Compatibility Question
        </Row>
      </Button>
      <AddCompatibilityQuestionModal open={open} setOpen={setOpen} />
    </>
  )
}

function AddCompatibilityQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

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

  const generateJson = () => {
    const jsonObject = options.reduce((obj, item, index) => {
      obj[index] = item
      return obj
    }, {} as Record<number, string>)
    return JSON.stringify(jsonObject, null, 2)
  }

  console.log()
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <Col className="w-full gap-4">
          <Col className="gap-1">
            <label>
              Question<span className={'text-scarlet-500'}>*</span>
            </label>
            <ExpandingInput
              maxLength={MAX_QUESTION_LENGTH}
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
            <Button color="gray">Cancel</Button>
            <Button>Submit & Answer</Button>
          </Row>
        </Col>
      </Col>
    </Modal>
  )
}

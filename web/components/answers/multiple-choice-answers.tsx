import { MAX_ANSWER_LENGTH } from 'common/answer'
import { useState } from 'react'
import Textarea from 'react-expanding-textarea'
import { XIcon } from '@heroicons/react/solid'

import { Col } from '../layout/col'
import { Row } from '../layout/row'

export function MultipleChoiceAnswers(props: {
  answers: string[]
  setAnswers: (answers: string[]) => void
}) {
  const { answers, setAnswers } = props

  const setAnswer = (i: number, answer: string) => {
    const newAnswers = setElement(answers, i, answer)
    setAnswers(newAnswers)
  }

  const removeAnswer = (i: number) => {
    const newAnswers = answers.slice(0, i).concat(answers.slice(i + 1))
    setAnswers(newAnswers)
  }

  const addAnswer = () => setAnswer(answers.length, '')

  return (
    <Col>
      {answers.map((answer, i) => (
        <Row className="mb-2 items-center align-middle">
          {i + 1}.{' '}
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(i, e.target.value)}
            className="textarea textarea-bordered ml-2 w-full resize-none"
            placeholder="Type your answer..."
            rows={1}
            maxLength={MAX_ANSWER_LENGTH}
          />
          {answers.length > 2 && (
            <button
              className="-mr-2 rounded p-2"
              onClick={() => removeAnswer(i)}
            >
              <XIcon className="h-5 w-5 flex-shrink-0" />
            </button>
          )}
        </Row>
      ))}

      <Row className="justify-end">
        <button className="btn btn-outline btn-xs" onClick={addAnswer}>
          Add answer
        </button>
      </Row>
    </Col>
  )
}

const setElement = <T,>(array: T[], i: number, elem: T) => {
  const newArray = array.concat()
  newArray[i] = elem
  return newArray
}

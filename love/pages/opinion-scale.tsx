import { QuestionsForm } from 'love/components/questions-form'
import { Col } from 'web/components/layout/col'

export default function OpinionScalePage() {
  return (
    <Col>
      <QuestionsForm questionType="multiple_choice" />
    </Col>
  )
}

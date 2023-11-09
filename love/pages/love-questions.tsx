import { Col } from 'web/components/layout/col'
import { QuestionsForm } from 'love/components/questions-form'

export default function QuestionsPage() {
  return (
    <Col>
      <QuestionsForm questionType="free_response" />
    </Col>
  )
}

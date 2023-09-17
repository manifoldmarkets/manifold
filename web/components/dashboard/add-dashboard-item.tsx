import {
  DashboardItem,
  DashboardLinkItem,
  DashboardQuestionItem,
} from 'common/dashboard'
import { Row } from '../layout/row'
import { DashboardAddContractButton } from './dashboard-add-contract-button'
import { DashboardAddLinkButton } from './dashboard-add-link-button'

export function AddDashboardItemWidget(props: {
  items: DashboardItem[]
  setItems: (items: DashboardItem[]) => void
}) {
  const { items, setItems } = props

  return (
    <Row className="border-ink-200 text-ink-400 items-center gap-4 rounded-lg border-2 border-dashed p-2">
      <DashboardAddContractButton
        addQuestions={(questions: DashboardQuestionItem[]) => {
          setItems([...items, ...questions])
        }}
      />
      OR
      <DashboardAddLinkButton
        addLink={(link: DashboardLinkItem) => {
          setItems([...items, link])
        }}
      />
    </Row>
  )
}

import { Row } from 'components/layout/row'
import { ThemedText } from 'components/themed-text'
import { CPMMMultiContract } from 'common/contract'
import { Col } from 'components/layout/col'
import { AnswerProbability } from 'components/contract/probability'
import { useColor } from 'hooks/use-color'
import { MultiBetButtons } from 'components/contract/bet/multi-bet-buttons'
import { AnswerPosition } from '../bet/answer-position'
import { useUser } from 'hooks/use-user'

export function MultiOverview(props: { contract: CPMMMultiContract }) {
  const { contract } = props
  const color = useColor()
  const user = useUser()

  return (
    <Col style={{ gap: 16 }}>
      {contract.answers?.map((answer) => (
        <Col
          key={answer.id}
          style={{
            gap: 8,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: color.border,
          }}
        >
          <Row
            key={answer.id}
            style={{
              width: '100%',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <ThemedText size="md" style={{ flex: 1 }}>
              {answer.text}
            </ThemedText>

            <AnswerProbability
              contract={contract}
              answerId={answer.id}
              size="lg"
            />
          </Row>
          <MultiBetButtons
            style={{ flex: 1 }}
            contract={contract}
            answerId={answer.id}
            gap={12}
          />
          {user && (
            <AnswerPosition contract={contract} answer={answer} user={user} />
          )}
        </Col>
      ))}
    </Col>
  )
}

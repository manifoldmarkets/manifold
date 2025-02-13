import { useState } from 'react'
import { StyleSheet, ScrollView, Pressable } from 'react-native'
import { useAPIGetter } from 'hooks/use-api-getter'
import { User } from 'common/user'
import { Row } from '../layout/row'
import { Col } from '../layout/col'
import { ThemedText } from '../themed-text'
import { useColor } from 'hooks/use-color'
import { Colors } from 'constants/colors'
import {
  AnyBalanceChangeType,
  BetBalanceChange,
  TxnBalanceChange,
  isBetChange,
  isTxnChange,
  txnTitle,
  txnTypeToDescription,
} from 'common/balance-change'
import { formatJustDateShort, formatJustTime } from 'client-common/lib/time'
import { useRouter } from 'expo-router'
import { contractPathWithoutContract } from 'common/contract'
import dayjs from 'dayjs'
import { DAY_MS } from 'common/util/time'
import { TokenNumber } from 'components/token/token-number'

export const BalanceChangeTable = (props: { user: User }) => {
  const { user } = props

  const [before, setBefore] = useState<number | undefined>(undefined)
  const [after, setAfter] = useState(
    dayjs().startOf('day').subtract(14, 'day').valueOf()
  )

  const { data: allBalanceChanges } = useAPIGetter('get-balance-changes', {
    userId: user.id,
    before,
    after,
  })

  const balanceChanges = allBalanceChanges ?? []

  return (
    <ScrollView style={styles.container}>
      <Col style={{ gap: 16, paddingVertical: 16 }}>
        <RenderBalanceChanges balanceChanges={balanceChanges} />
      </Col>
    </ScrollView>
  )
}

function RenderBalanceChanges(props: {
  balanceChanges: AnyBalanceChangeType[]
}) {
  const { balanceChanges } = props

  return (
    <>
      {balanceChanges.map((change, i) => {
        if (isBetChange(change)) {
          return (
            <BetBalanceChangeRow
              key={change.key}
              change={change}
              token={change.contract.token}
            />
          )
        } else if (isTxnChange(change)) {
          return (
            <TxnBalanceChangeRow
              key={change.key}
              change={change as TxnBalanceChange}
            />
          )
        }
      })}
    </>
  )
}

const betChangeToText = (change: BetBalanceChange) => {
  const { type, bet } = change
  const { outcome } = bet
  return type === 'redeem_shares'
    ? `Redeem shares`
    : type === 'loan_payment'
    ? `Pay back loan`
    : type === 'fill_bet'
    ? `Fill ${outcome} order`
    : type === 'sell_shares'
    ? `Sell ${outcome} shares`
    : `Buy ${outcome}`
}

const BetBalanceChangeRow = (props: {
  change: BetBalanceChange
  token: 'MANA' | 'CASH'
}) => {
  const { change, token } = props
  const { amount, contract, answer } = change
  const { slug, question, creatorUsername } = contract
  const router = useRouter()
  const color = useColor()

  const onPress = () => {
    if (slug) {
      router.push(contractPathWithoutContract(creatorUsername, slug) as any)
    }
  }

  return (
    <Pressable onPress={onPress}>
      <Row style={styles.changeRow}>
        <ThemedText size="sm">{amount > 0 ? '+' : '-'}</ThemedText>
        <TokenNumber
          amount={Math.abs(amount)}
          token={token}
          style={{
            color: amount > 0 ? color.profitText : color.textTertiary,
          }}
        />
        <Col style={{ flex: 1 }}>
          <ThemedText size="sm" numberOfLines={2}>
            {question}
          </ThemedText>
          <ThemedText size="xs" color={color.textTertiary}>
            {betChangeToText(change)} {answer ? ` on ${answer.text}` : ''}
          </ThemedText>
        </Col>
        <ThemedText size="xs" color={color.textTertiary}>
          {customFormatTime(change.createdTime)}
        </ThemedText>
      </Row>
    </Pressable>
  )
}

const customFormatTime = (time: number) => {
  if (time > Date.now() - DAY_MS) {
    return formatJustTime(time)
  }
  return formatJustDateShort(time)
}

const TxnBalanceChangeRow = (props: { change: TxnBalanceChange }) => {
  const { change } = props
  const { contract, amount, type, token, user, charity, description } = change
  const router = useRouter()

  const onPress = () => {
    if (contract?.slug) {
      router.push(
        contractPathWithoutContract(
          contract.creatorUsername,
          contract.slug
        ) as any
      )
    } else if (user?.username) {
      router.push(('/' + user.username) as any)
    } else if (charity?.slug) {
      router.push(('/charity/' + charity.slug) as any)
    }
  }

  return (
    <Pressable onPress={onPress}>
      <Row style={styles.changeRow}>
        <ThemedText size="sm">{amount > 0 ? '+' : '-'}</ThemedText>
        <TokenNumber
          amount={Math.abs(amount)}
          token={token as any}
          style={{
            color: amount > 0 ? Colors.profitText : Colors.textTertiary,
          }}
        />
        <Col style={{ flex: 1 }}>
          <ThemedText size="sm" numberOfLines={2}>
            {txnTitle(change)}
          </ThemedText>
          <ThemedText size="xs" color={Colors.textTertiary}>
            {txnTypeToDescription(type) ?? description ?? type}
          </ThemedText>
        </Col>
        <ThemedText size="xs" color={Colors.textTertiary}>
          {customFormatTime(change.createdTime)}
        </ThemedText>
      </Row>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  changeRow: {
    padding: 12,
    gap: 2,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
})

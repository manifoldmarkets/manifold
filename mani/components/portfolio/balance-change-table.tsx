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
  isPerpChange,
  TxnBalanceChange,
  PerpBalanceChange,
  isBetChange,
  isTxnChange,
  BALANCE_CHANGE_TYPE_LABELS,
} from 'common/balance-change'
import { formatJustDateShort, formatJustTime } from 'client-common/lib/time'
import { useRouter } from 'expo-router'
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
      {balanceChanges.map((change) => {
        if (isBetChange(change)) {
          return (
            <BetBalanceChangeRow
              key={change.key}
              change={change}
              token={change.contract.token}
            />
          )
        } else if (isPerpChange(change)) {
          return <PerpBalanceChangeRow key={change.key} change={change} />
        } else if (isTxnChange(change)) {
          return <TxnBalanceChangeRow key={change.key} change={change} />
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
      router.push(`/${creatorUsername}/${slug}`)
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

const PerpBalanceChangeRow = (props: { change: PerpBalanceChange }) => {
  const { change } = props
  const { contract, description } = change
  const router = useRouter()

  const onPress = () => {
    if (contract.slug) {
      router.push(`/${contract.creatorUsername}/${contract.slug}`)
    }
  }

  return (
    <Pressable onPress={onPress}>
      <Row style={styles.changeRow}>
        <ThemedText color={Colors.error} size="sm" weight="bold">
          Liquidated
        </ThemedText>
        <Col style={{ flex: 1 }}>
          <ThemedText size="sm" numberOfLines={2}>
            {contract.question}
          </ThemedText>
          <ThemedText color={Colors.textTertiary} numberOfLines={3} size="xs">
            {description}
          </ThemedText>
        </Col>
        <ThemedText size="xs" color={Colors.textTertiary}>
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
      router.push(`/${contract.creatorUsername}/${contract.slug}`)
    } else if (user?.username) {
      router.push(`/${user.username}`)
    } else if (charity?.slug) {
      router.push(`/old-charity/${charity.slug}`)
    }
  }
  const displayToken = token === 'CASH' ? 'CASH' : 'MANA'
  const title =
    contract?.question ??
    user?.name ??
    charity?.name ??
    BALANCE_CHANGE_TYPE_LABELS[type]

  return (
    <Pressable onPress={onPress}>
      <Row style={styles.changeRow}>
        <ThemedText size="sm">{amount > 0 ? '+' : '-'}</ThemedText>
        <TokenNumber
          amount={Math.abs(amount)}
          token={displayToken}
          style={{
            color: amount > 0 ? Colors.profitText : Colors.textTertiary,
          }}
        />
        <Col style={{ flex: 1 }}>
          <ThemedText size="sm" numberOfLines={2}>
            {title}
          </ThemedText>
          <ThemedText size="xs" color={Colors.textTertiary}>
            {description ?? BALANCE_CHANGE_TYPE_LABELS[type]}
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

import { formatShortened } from 'lib/shorten-number'
import { Row } from '../layout/row'
import { ThemedText, ThemedTextProps } from '../themed-text'
import { FontSize } from '../themed-text'
import { Token } from './token'
import { ContractToken } from 'common/contract'

export function TokenNumber(
  props: {
    amount: number
    token?: ContractToken
    showDecimals?: boolean
    shortened?: boolean
  } & ThemedTextProps
) {
  const { amount, token, showDecimals, shortened, ...rest } = props
  const getTokenSize = (size?: FontSize): number => {
    switch (size) {
      case 'xs':
        return 10
      case 'sm':
        return 12
      case 'md':
        return 14
      case 'lg':
        return 16
      case 'xl':
        return 18
      case '2xl':
        return 21
      case '3xl':
        return 26
      case '4xl':
        return 31
      case '5xl':
        return 40
      case '6xl':
        return 50
      case '7xl':
        return 60
      case '8xl':
        return 80
      case '9xl':
        return 104
      default:
        return 14
    }
  }

  const getGapSize = (size?: FontSize): number => {
    switch (size) {
      case 'xs':
        return 1
      case 'sm':
        return 1
      case 'md':
        return 2
      case 'lg':
        return 2
      case 'xl':
        return 4
      case '2xl':
        return 4
      case '3xl':
        return 8
      case '4xl':
        return 9
      case '5xl':
      case '6xl':
      case '7xl':
      case '8xl':
      case '9xl':
        return 10
      default:
        return 4 // default to md size
    }
  }

  const formattedNumber = (() => {
    const isNegative = amount < 0
    const absAmount = Math.abs(amount)

    const formatted = shortened
      ? formatShortened(absAmount)
      : showDecimals
      ? new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(absAmount)
      : new Intl.NumberFormat('en-US').format(Math.round(absAmount))

    if (formatted === '0' || formatted === '0.00') {
      return formatted
    }

    return isNegative ? '-' + formatted : formatted
  })()

  return (
    <Row style={{ alignItems: 'center', gap: getGapSize(rest.size) }}>
      {formattedNumber.startsWith('-') ? (
        <ThemedText family={'JetBrainsMono'} {...rest}>
          -
        </ThemedText>
      ) : null}
      <Token
        overrideToken={token}
        style={{
          width: getTokenSize(rest.size),
          height: getTokenSize(rest.size),
          resizeMode: 'contain',
        }}
      />
      <ThemedText family={'JetBrainsMono'} {...rest}>
        {formattedNumber.replace('-', '')}
      </ThemedText>
    </Row>
  )
}

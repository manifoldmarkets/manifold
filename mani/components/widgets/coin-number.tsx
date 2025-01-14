import { Text, Image } from 'react-native'
import { ContractToken } from 'common/contract'
import {
  formatMoneyNoMoniker,
  formatSweepiesNumber,
  getMoneyNumberToDecimal,
} from 'common/util/format'
import { shortenNumber } from 'common/util/formatNumber'
import { Row } from '../layout/row'
import ManaFlatImage from '../../assets/images/masses_mana_flat.png'
import SweepsFlatImage from '../../assets/images/masses_sweeps_flat.png'
import { useTokenMode } from 'hooks/use-token-mode'
import { Colors } from 'constants/colors'

export type NumberDisplayType = 'short' | 'animated' | 'toDecimal'

export function CoinNumber(props: {
  amount?: number
  coinType?: 'mana' | 'spice' | 'sweepies' | ContractToken
  numberType?: NumberDisplayType
  hideAmount?: boolean
  style?: any
}) {
  const { hideAmount, amount, coinType = 'MANA', numberType, style } = props

  const { token } = useTokenMode()
  const isSweeps =
    coinType === 'sweepies' || coinType === 'CASH' || token === 'CASH'

  const textStyle = { color: Colors.text }

  return (
    <Row style={[{ alignItems: 'center', gap: 4 }, style]}>
      {amount !== undefined && amount <= -1 && <Text style={textStyle}>-</Text>}
      <Image
        source={isSweeps ? SweepsFlatImage : ManaFlatImage}
        style={{ width: 20, height: 20 }}
      />
      {hideAmount ? (
        <Text style={textStyle} />
      ) : amount == undefined ? (
        <Text style={textStyle}>---</Text>
      ) : coinType === 'sweepies' || coinType === 'CASH' ? (
        <Text style={[textStyle, style]}>
          {formatSweepiesNumber(Math.abs(amount ?? 0), {
            toDecimal: numberType == 'toDecimal' ? 2 : undefined,
            short: numberType == 'short' ? true : false,
          })}
        </Text>
      ) : numberType == 'short' ? (
        <Text style={[textStyle, style]}>
          {shortenNumber(
            +formatMoneyNoMoniker(Math.abs(amount ?? 0)).replaceAll(',', '')
          )}
        </Text>
      ) : numberType == 'toDecimal' ? (
        <Text style={[textStyle, style]}>
          {getMoneyNumberToDecimal(Math.abs(amount ?? 0))}
        </Text>
      ) : (
        <Text style={[textStyle, style]}>
          {formatMoneyNoMoniker(Math.abs(amount))}
        </Text>
      )}
    </Row>
  )
}

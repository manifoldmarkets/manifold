import {
  BinaryContract,
  CPMMMultiContract,
  isSportsContract,
  MultiContract,
} from 'common/contract'
import { ThemedText } from 'components/themed-text'
import { TouchableOpacity } from 'react-native'
import { isBinaryMulti } from 'common/contract'
import { Row } from 'components/layout/row'
import { useColor } from 'hooks/use-color'
import { AnswerProbability, BinaryProbability } from './probability'
import { BinaryBetButtons } from './bet/binary-bet-buttons'
import { MultiBetButtons } from './bet/multi-bet-buttons'
import { useRouter } from 'expo-router'
import { MultiBinaryBetButtons } from './bet/multi-binary-bet-buttons'
import { useContract } from 'hooks/use-contract'
import { useTokenMode } from 'hooks/use-token-mode'
import { filterDefined } from 'common/util/array'
import { ContractPair, getDefinedContract } from 'lib/contracts'
import { Animated } from 'react-native'
import { useEffect, useRef } from 'react'
import { getIsLive } from 'common/sports-info'
import { TokenNumber } from 'components/token/token-number'

function LiveDot() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start()
  }, [])

  return (
    <Row style={{ alignItems: 'center', gap: 4, paddingLeft: 4 }}>
      <Animated.View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: 'red',
          opacity: pulseAnim,
        }}
      />
      <ThemedText color={'red'}>Live</ThemedText>
    </Row>
  )
}

export function FeedCard(props: { contractPair: ContractPair }) {
  const { token } = useTokenMode()
  const { contractPair } = props
  const definedContract = getDefinedContract(contractPair)

  const liveContract = useContract(definedContract)
  const liveSiblingContract = useContract({
    id: definedContract.siblingContractId!,
  })
  const contract =
    filterDefined([liveContract, liveSiblingContract]).find(
      (c) => c.token === token
    ) ?? definedContract
  const { outcomeType } = contract
  const router = useRouter()
  const isBinaryMc = isBinaryMulti(contract)
  const isMultipleChoice = outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc
  const isBinary = !isBinaryMc && !isMultipleChoice
  const isSports = isSportsContract(contract)

  const color = useColor()

  const handlePress = () => {
    router.push(`/${contract.id}`)
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{
        gap: 12,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
      }}
    >
      <Row
        style={{
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        {!(isSports && isBinaryMc) && (
          <ThemedText
            size={'lg'}
            weight="semibold"
            numberOfLines={3}
            style={{ flex: 1 }}
          >
            {contract.question}
          </ThemedText>
        )}
        {isBinary && (
          <Row
            style={{
              alignItems: 'center',
              width: 50,
              justifyContent: 'flex-end',
            }}
          >
            <BinaryProbability
              contract={contract as BinaryContract}
              size="xl"
            />
          </Row>
        )}
      </Row>

      {isMultipleChoice ? (
        //   !isBinaryMc &&
        <>
          {contract.answers
            .sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0))
            .slice(0, 3)
            .map((answer) => (
              <Row
                key={answer.id}
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <ThemedText
                  size="sm"
                  color={color.textSecondary}
                  numberOfLines={2}
                  style={{
                    flex: 1,
                    flexWrap: 'wrap',
                    lineHeight: 20,
                  }}
                >
                  {answer.text}
                </ThemedText>
                <Row style={{ gap: 12, alignItems: 'center', flexShrink: 0 }}>
                  <AnswerProbability
                    contract={contract as MultiContract}
                    answerId={answer.id}
                    size="md"
                    style={{ flexShrink: 0 }}
                  />
                  <MultiBetButtons
                    contract={contract}
                    answerId={answer.id}
                    size="xs"
                  />
                </Row>
              </Row>
            ))}
          <Row style={{ weight: '100%', justifyContent: 'flex-end' }}>
            {contract.answers.length > 3 && (
              <ThemedText color={color.textSecondary} weight="semibold">
                + {contract.answers.length - 3} more
              </ThemedText>
            )}
          </Row>
        </>
      ) : isBinary ? (
        <BinaryBetButtons contract={contract} />
      ) : (
        <MultiBinaryBetButtons contract={contract as CPMMMultiContract} />
      )}
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ gap: 4 }}>
          <TokenNumber
            amount={contract.volume}
            size="sm"
            color={color.textTertiary}
            shortened
          />
          <ThemedText color={color.textQuaternary} size="sm">
            volume
          </ThemedText>
        </Row>
        {getIsLive(contract) && <LiveDot />}
      </Row>
    </TouchableOpacity>
  )
}

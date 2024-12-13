import { Contract } from 'common/contract'
import { ThemedText } from 'components/ThemedText'
import { View } from 'react-native'
// import { isBinaryMulti } from 'common/contract'

export function FeedCard({ contract }: { contract: Contract }) {
  //   const isBinaryMc = isBinaryMulti(contract)
  return (
    <View>
      <ThemedText size="md" weight="semibold">
        {contract.question}
      </ThemedText>
      {/* 
      {contract.outcomeType == 'MULTIPLE_CHOICE' && !isBinaryMc && <>MULTI</>}
      {isBinaryMc && <>BINARY</>} */}
    </View>
  )
}

import { useColor } from 'hooks/use-color'
import { useTokenMode } from 'hooks/use-token-mode'
import { Row } from './row'
import { ThemedText } from 'components/themed-text'
import { TokenToggle } from 'components/token/token-toggle'
import { usePathname, useRouter } from 'expo-router'
import { IconSymbol } from 'components/ui/icon-symbol'
import { TouchableOpacity } from 'react-native'
import { isTabPath } from 'app/(tabs)/_layout'
import { useUser } from 'hooks/use-user'
import { formatMoneyNumber } from 'common/util/format'
import { CASH_NAME, MANA_NAME } from 'constants/token-names'
import { StreakWidget } from 'components/streak/streak-widget'

export const HEADER_HEIGHT = 47

export function TokenToggleHeader() {
  const color = useColor()
  const { token } = useTokenMode()
  const pathname = usePathname()
  const router = useRouter()
  const user = useUser()
  // Check if we're in a tab route - should match paths like /(tabs)/live, /(tabs)/profile, etc.
  const isInTabs = isTabPath(pathname)
  const isHome = pathname === '/'
  const showStreak = isHome && user
  const userBalance = !user
    ? 0
    : token === 'MANA'
    ? user.balance
    : user.cashBalance

  return (
    <Row
      style={{
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        gap: 8,
        paddingVertical: 8,
        paddingHorizontal: 20,
        backgroundColor: color.background,
      }}
    >
      {!isInTabs && (
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={24} color={color.textTertiary} />
        </TouchableOpacity>
      )}
      {showStreak && <StreakWidget user={user} />}

      <Row
        style={{
          marginLeft: 'auto',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <ThemedText color={color.primary} family={'JetBrainsMono'} size="md">
          <ThemedText weight={'bold'} color={color.primary}>
            {formatMoneyNumber(userBalance)}
          </ThemedText>
          {token === 'MANA' ? ` ${MANA_NAME}` : ` ${CASH_NAME}`}
        </ThemedText>
        <TokenToggle />
      </Row>
    </Row>
  )
}

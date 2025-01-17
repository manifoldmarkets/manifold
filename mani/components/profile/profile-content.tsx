import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { TopTabs } from 'components/layout/top-tabs'
import Page from 'components/page'
import { Positions } from 'components/profile/positions'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { Rounded } from 'constants/border-radius'
import { useColor } from 'hooks/use-color'
import { Image, View } from 'react-native'
import { auth } from 'lib/firebase/init'
import { clearData } from 'lib/auth-storage'
import { Button } from 'components/buttons/button'
import { router } from 'expo-router'
import { BalanceChangeTable } from 'components/portfolio/balance-change-table'
import { buildArray } from 'common/util/array'
import { User } from 'common/user'
import { useUser } from 'hooks/use-user'
import { useAPIGetter } from 'hooks/use-api-getter'
import { useTokenMode } from 'hooks/use-token-mode'

export function ProfileContent(props: { user: User }) {
  const color = useColor()
  const { user } = props
  const currentUser = useUser()
  const isCurrentUser = currentUser?.id === user.id

  const signOut = async () => {
    try {
      await auth.signOut()
      await clearData('user')
    } catch (err) {
      console.error('Error signing out:', err)
    }
  }

  const { data } = useAPIGetter('get-daily-changed-metrics-and-contracts', {
    userId: user.id,
    limit: 24,
  })
  const { token } = useTokenMode()

  const manaProfit = data?.manaProfit ?? 0
  const cashProfit = data?.cashProfit ?? 0
  const manaInvestmentValue = data?.manaInvestmentValue ?? 0
  const cashInvestmentValue = data?.cashInvestmentValue ?? 0
  const manaNetWorth = manaInvestmentValue + (user?.balance ?? 0)
  const cashNetWorth = cashInvestmentValue + (user?.cashBalance ?? 0)

  return (
    <Page>
      <Col style={{ gap: 12 }}>
        <Row style={{ gap: 12 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: Rounded.full,
              backgroundColor: user?.avatarUrl ? 'transparent' : color.blue,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Image
              style={{
                width: user?.avatarUrl ? 48 : 40,
                height: user?.avatarUrl ? 48 : 40,
                borderRadius: user?.avatarUrl ? Rounded.full : 0,
              }}
              source={
                user?.avatarUrl
                  ? { uri: user.avatarUrl }
                  : // eslint-disable-next-line @typescript-eslint/no-require-imports
                    require('../../assets/images/origami-icons/turtle.png')
              }
            />
          </View>
          <Col>
            <ThemedText size="md" weight="semibold">
              {user.name}
            </ThemedText>
            <ThemedText size="md" color={color.textTertiary}>
              @{user.username}
            </ThemedText>
          </Col>
          {isCurrentUser && (
            <Button
              onPress={signOut}
              variant="gray"
              size="sm"
              title="Sign out"
              style={{ marginTop: 20 }}
            />
          )}
        </Row>
        <Row>
          <Col style={{ width: '50%' }}>
            <ThemedText size="md" color={color.textTertiary}>
              Net worth
            </ThemedText>
            <TokenNumber
              amount={token === 'MANA' ? manaNetWorth : cashNetWorth}
              size="2xl"
            />
          </Col>
          <Col>
            <ThemedText size="md" color={color.textTertiary}>
              Daily profit
            </ThemedText>
            <TokenNumber
              amount={token === 'MANA' ? manaProfit : cashProfit}
              size="2xl"
            />
          </Col>
        </Row>
        {isCurrentUser && (
          <Row>
            <Button
              onPress={() => router.push('/redeem')}
              title="Redeem"
              variant="gray"
            />
          </Row>
        )}
        <TopTabs
          tabs={buildArray(
            {
              title: 'Positions',
              content: <Positions user={user} />,
            },
            user && {
              title: 'Balance Log',
              content: <BalanceChangeTable user={user} />,
            }
          )}
        />
      </Col>
    </Page>
  )
}

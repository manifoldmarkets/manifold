import { Col } from 'components/layout/col'
import { Row } from 'components/layout/row'
import { TopTabs } from 'components/layout/top-tabs'
import Page from 'components/page'
import { Positions } from 'components/profile/positions'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { Rounded } from 'constants/border-radius'
import { useColor } from 'hooks/use-color'
import { useUser } from 'hooks/use-user'
import { Image, View } from 'react-native'

export default function Profile() {
  // TODO: actually grab this data. Do sorting in backend
  // TODO: this view only works for binary contracts. There needs to be a way to make this work for multi choice contracts as well

  const color = useColor()
  const { user } = useUser()

  return (
    <Page>
      <Col style={{ gap: 12 }}>
        <Row style={{ gap: 12 }}>
          {/* TODO: make actual user info */}
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: Rounded.full,
              backgroundColor:
                // user?.avatarUrl ? 'transparent' :
                color.blue,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Image
              style={{
                width:
                  // user?.avatarUrl ? 28 :
                  40,
                height:
                  // user?.avatarUrl ? 28 :
                  40,
                borderRadius:
                  // user?.avatarUrl ? Rounded.full, :
                  0,
              }}
              source={
                // user?.avatarUrl
                //   ? { uri: user.avatarUrl }
                //   :
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                require('../../assets/images/origami-icons/turtle.png')
              }
            />
          </View>
          <Col>
            <ThemedText size="md" weight="semibold">
              {user?.displayName}
            </ThemedText>
            <ThemedText size="md" color={color.textTertiary}>
              {user?.displayName}
            </ThemedText>
          </Col>
        </Row>
        <Row>
          <Col style={{ width: '50%' }}>
            <ThemedText size="md" color={color.textTertiary}>
              Total bet
            </ThemedText>
            <TokenNumber amount={302.3} size="2xl" />
          </Col>
          <Col>
            <ThemedText size="md" color={color.textTertiary}>
              Potential payout
            </ThemedText>
            <TokenNumber amount={604} size="2xl" />
          </Col>
        </Row>
        <TopTabs
          tabs={[
            {
              title: 'Positions',
              content: <Positions />,
            },
            {
              title: 'Balance Log',
              content: <ThemedText>Balance Log</ThemedText>,
            },
          ]}
        />
      </Col>
    </Page>
  )
}

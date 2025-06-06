import { StyleSheet, View, Pressable } from 'react-native'
import { ThemedText } from './themed-text'
import { Row } from './layout/row'
import { Colors } from 'constants/colors'
import { openBrowserAsync } from 'expo-web-browser'

function Bullet() {
  return <ThemedText style={styles.bullet}>•</ThemedText>
}

type FooterLinkProps = {
  href: string
  children: string
}

function FooterLink({ href, children }: FooterLinkProps) {
  return (
    <Pressable
      onPress={() => {
        openBrowserAsync(href)
      }}
    >
      <ThemedText style={styles.link}>{children}</ThemedText>
    </Pressable>
  )
}

export function Footer() {
  return (
    <View style={styles.container}>
      <Row style={styles.links}>
        <FooterLink href="https://docs.manifold.markets/terms-and-conditions">
          Terms
        </FooterLink>
        <Bullet />
        <FooterLink href="https://docs.manifold.markets/privacy-policy">
          Privacy
        </FooterLink>
        <Bullet />
        <FooterLink href="https://docs.manifold.markets/rules">
          Rules
        </FooterLink>
      </Row>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  links: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bullet: {
    color: Colors.textQuaternary,
    fontSize: 8,
  },
  link: {
    color: Colors.textQuaternary,
    fontSize: 14,
  },
})

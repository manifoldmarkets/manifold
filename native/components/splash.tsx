import { ActivityIndicator, Image, StyleSheet, View } from 'react-native'
import { AuthPageStyles } from './auth-page'
export const Splash = (props: { width: number; height: number }) => {
  const { width, height } = props

  const styles = StyleSheet.create({
    activityIndicator: {
      height: AuthPageStyles.authContent.height,
    },
    container: {
      ...AuthPageStyles.container,
      height,
      width,
    },
    centerFlex: {
      ...AuthPageStyles.centerFlex,
    },
  })

  return (
    <View style={styles.container}>
      <View style={styles.centerFlex}>
        <Image
          source={require('../assets/logo.png')}
          style={AuthPageStyles.flappy}
        />
        <ActivityIndicator
          style={styles.activityIndicator}
          size={'large'}
          color={'white'}
        />
      </View>
    </View>
  )
}

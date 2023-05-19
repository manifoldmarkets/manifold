import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  StyleSheet,
} from 'react-native'
export const Splash = (props: {
  width: number
  height: number
  source: ImageSourcePropType
}) => {
  const { width, height, source } = props

  const styles = StyleSheet.create({
    image: {
      height,
      width,
      flex: 1,
      justifyContent: 'center',
      resizeMode: 'cover',
    },
    activityIndicator: {
      position: 'absolute',
      left: width / 2 - 20,
      bottom: 100,
    },
  })

  return (
    <>
      <Image style={styles.image} source={source} />
      <ActivityIndicator
        style={styles.activityIndicator}
        size={'large'}
        color={'white'}
      />
    </>
  )
}

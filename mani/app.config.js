import appJson from './app.json'

export default ({ config }) => {
  const otaUpdateVersion = '1.0.0'
  const combinedConfig = {
    ...appJson,
    ...config,
  }
  return {
    expo: {
      ...combinedConfig.expo,
      runtimeVersion: otaUpdateVersion,
      extra: {
        ...combinedConfig.extra,
        eas: {
          ...combinedConfig.eas,
          projectId: '34945d6b-47a3-4525-84ff-11d8642f13cc',
          NATIVE_BUILD_TYPE: process.env.NATIVE_BUILD_TYPE,
          NEXT_PUBLIC_FIREBASE_ENV: process.env.NEXT_PUBLIC_FIREBASE_ENV,
        },
      },
      android: {
        ...combinedConfig.android,
        runtimeVersion: otaUpdateVersion,
      },
      ios: {
        ...combinedConfig.ios,
        runtimeVersion: otaUpdateVersion,
      },
    },
  }
}

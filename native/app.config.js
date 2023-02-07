export default ({ config }) => ({
  ...config,
  hooks: {
    postPublish: [
      {
        file: 'sentry-expo/upload-sourcemaps',
        config: {
          organization: 'manifold-markets',
          project: 'react-native',
          authToken: process.env.SENTRY_AUTH_TOKEN,
        },
      },
    ],
  },
  extra:{
    eas:{
      projectId:"0ce454fc-3885-4eab-88b6-787b1691973b",
      NATIVE_BUILD_TYPE: process.env.NATIVE_BUILD_TYPE,
      NEXT_PUBLIC_FIREBASE_ENV: process.env.NEXT_PUBLIC_FIREBASE_ENV,
    }
  }
})

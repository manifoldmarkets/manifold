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
})

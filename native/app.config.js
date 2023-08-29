export default ({ config }) => ({
  ...config,
  extra:{
    eas:{
      projectId:"0ce454fc-3885-4eab-88b6-787b1691973b",
      NATIVE_BUILD_TYPE: process.env.NATIVE_BUILD_TYPE,
      NEXT_PUBLIC_FIREBASE_ENV: process.env.NEXT_PUBLIC_FIREBASE_ENV,
    }
  }
})

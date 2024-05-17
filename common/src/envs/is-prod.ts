export const isProd = () => {
  // For cloud run API service
  if (process.env.ENVIRONMENT) {
    return process.env.ENVIRONMENT == 'PROD'
    // For local web dev and vercel
  } else if (process.env.NEXT_PUBLIC_FIREBASE_ENV) {
    return process.env.NEXT_PUBLIC_FIREBASE_ENV == 'PROD'
  } else {
    // For local scripts and cloud functions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin')
    return admin.app().options.projectId === 'mantic-markets'
  }
}

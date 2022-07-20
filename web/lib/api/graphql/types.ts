import type { FirebaseAPI } from './datasources/firebaseAPI'

/* Context type */
export type contextType = {
  dataSources: {
    firebaseAPI: FirebaseAPI
  }
}

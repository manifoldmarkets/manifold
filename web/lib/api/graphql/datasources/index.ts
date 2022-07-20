import type { contextType } from '../types'

import { FirebaseAPI } from './firebaseAPI'

const dataSources = () =>
  ({
    firebaseAPI: new FirebaseAPI(),
  } as contextType['dataSources'])

export default dataSources

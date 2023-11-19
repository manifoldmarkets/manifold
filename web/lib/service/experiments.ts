import { ENV_CONFIG } from 'common/envs/constants'
import { Experiment, ExperimentClient } from '@amplitude/experiment-js-client'

let client: ExperimentClient | undefined

const getClient = () => {
  if (client == null) {
    client = Experiment.initialize(ENV_CONFIG.amplitudeApiKey)
  }
  return client
}

export const startExperiments = async () => {
  const client = getClient()
  return client.start()
}
export const clearExperiments = () => {
  const client = getClient()
  return client.clear()
}

export const getVariant = (experimentName: string) => {
  const client = getClient()
  return client.variant(experimentName)
}

export const getVariants = () => {
  const client = getClient()
  return client.all()
}

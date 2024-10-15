import { parentPort as maybeParentPort } from 'worker_threads'
import { calculateBetResult } from '../place-bet'

const parentPort = maybeParentPort
if (parentPort) {
  parentPort.on('message', (data: any) => {
    const result = calculateBetResult(
      data.body,
      data.user,
      data.contract,
      data.answers,
      data.unfilledBets,
      data.balanceByUserId
    )
    parentPort.postMessage(result)
  })
}

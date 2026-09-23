import { getPerpEffectiveTakerFeeBps } from 'common/perps/fees'
import { getPerpConfig } from 'common/perps/management'
import { setPerpConfig } from 'shared/perps/manage-config'
import { log, revalidateContractStaticProps } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { APIHandler } from './helpers/endpoint'

export const updatePerpConfig: APIHandler<'update-perp-config'> = async (
  body,
  auth
) => {
  const updated = await setPerpConfig(body, auth.uid)
  log(
    `perp manager ${auth.uid} updated ${updated.slug}`,
    getPerpConfig(updated)
  )
  broadcastUpdatedContract(updated.visibility, {
    id: updated.id,
    ...getPerpConfig(updated),
    lastUpdatedTime: updated.lastUpdatedTime,
  })
  return {
    result: {
      success: true as const,
      ...getPerpConfig(updated),
      takerFeeApiBps: updated.takerFeeApiBps ?? null,
      effectiveTakerFeeApiBps: getPerpEffectiveTakerFeeBps(updated, true),
    },
    continue: async () => {
      await revalidateContractStaticProps(updated)
    },
  }
}

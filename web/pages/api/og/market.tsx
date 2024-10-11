import { ImageResponse } from '@vercel/og'
import { ImageResponseOptions } from '@vercel/og/dist/types'
import { NextRequest } from 'next/server'
import { ContractEmbedPage } from 'web/pages/[username]/[contractSlug]'
import { classToTw } from 'web/components/og/utils'
import { OgCardProps } from 'common/contract-seo'
import { unauthedApi } from 'common/util/api'
import { base64toPoints } from 'common/edge/og'
import { getCardOptions } from './market'

export const config = { runtime: 'edge' }
export const getCardOptions = async () => {
  const [light, med] = await Promise.all([figtreeLightData, figtreeMediumData])

  return {
    width: 600,
    height: 315,
    fonts: [
      {
        name: 'Figtree',
        data: med,
        style: 'normal',
      },
      {
        name: 'Figtree-light',
        data: light,
        style: 'normal',
      },
    ],
  }
}

const FIGTREE_LIGHT_URL = new URL('Figtree-Light.ttf', import.meta.url)
const figtreeLightData = fetch(FIGTREE_LIGHT_URL).then((res) =>
  res.arrayBuffer()
)
const FIGTREE_MED_URL = new URL('Figtree-Medium.ttf', import.meta.url)
const figtreeMediumData = fetch(FIGTREE_MED_URL).then((res) =>
  res.arrayBuffer()
)

export default async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const contractSlug = searchParams.get('contractSlug')
    const username = searchParams.get('username')

    const contract = await unauthedApi('slug/:slug', {
      slug: contractSlug,
    }).catch((e) => {
      throw new Error('Error fetching contract')
    })

    if (!contract) {
      throw new Error('Contract not found')
    }

    const cashContract = contract.siblingContractId
      ? await unauthedApi('market/:id', { id: contract.siblingContractId })
      : null

    const points = base64toPoints(contract.pointsString ?? '')
    const cashPoints = cashContract ? base64toPoints(cashContract.pointsString ?? '') : null

    const options = await getCardOptions()

    const image = (
      <ContractEmbedPage
        contract={contract}
        points={points}
        cashContract={cashContract}
        cashPoints={cashPoints}
      />
    )

    return new ImageResponse(classToTw(image), options as ImageResponseOptions)
  } catch (e: any) {
    console.error(e.message)
    return new Response(`Failed to generate the image`, {
      status: 500,
    })
  }
}


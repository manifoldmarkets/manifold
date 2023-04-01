import Image from 'next/image'
import { useState } from 'react'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { useFollows } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import { useUserById } from 'web/hooks/use-user-supabase'
import { MarketCard, useTopMarketsByUser } from './MarketCard'

export default function CardsPage() {
  const user = useUser()
  const follows = useFollows(user?.id)
  const topMarkets = useTopMarketsByUser(user?.id ?? '')
  console.log('top markets', topMarkets)
  return (
    <Page maxWidth="max-w-7xl font-grenze-gotisch">
      <h1 className="text-6xl">Manifold: the Gambling</h1>
      <Spacer h={4} />
      {/* Show a card for each follower in a grid, 6 cards wide */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {follows?.slice(0, 12).map((userId) => (
          <UserCard userId={userId} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {topMarkets?.slice(0, 12).map((contract) => (
          <MarketCard contract={contract} />
        ))}
      </div>
    </Page>
  )
}

export function GreenCard(props: {
  imageUrl: string
  title: string
  description: string
}) {
  const { imageUrl, title, description } = props
  const [faceup, setFaceup] = useState(false)
  return (
    <div
      className="font-grenze-gotisch relative h-[300px] w-[200px] cursor-pointer transition hover:z-10 hover:scale-125"
      onClick={() => setFaceup(!faceup)}
    >
      {faceup ? (
        <FaceupGreenCard
          imageUrl={imageUrl}
          title={title}
          description={description}
        />
      ) : (
        <Image
          className="absolute top-0 left-0"
          src={'/cards/back_red.png'}
          width={200}
          height={400}
          alt="Frame"
        />
      )}
    </div>
  )
}

export function FaceupGreenCard(props: {
  imageUrl: string
  title: string
  description: string
}) {
  const { imageUrl, title, description } = props
  const upscaleUrl = upscaleGoogleUrl(imageUrl)
  return (
    <div>
      <Image
        className="absolute top-0 left-0"
        src={upscaleUrl}
        width={200}
        height={200}
        alt="Avatar"
      />
      <Image
        className="absolute top-0 left-0"
        src={'/cards/frame_green.png'}
        width={200}
        height={400}
        alt="Frame"
      />
      <div className="line-clamp-1 absolute top-[165px] left-0 w-full bg-transparent text-center text-2xl font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]">
        {title}
      </div>
      <div className="line-clamp-4 absolute top-[210px] left-[15px] w-[170px] text-center text-sm leading-3">
        {description}
      </div>
    </div>
  )
}

export function UserCard(props: { userId: string }) {
  const { userId } = props
  const user = useUserById(userId)
  if (!user) return null
  return (
    <GreenCard
      imageUrl={user.avatarUrl}
      title={user.name}
      description={user.bio ?? user.followerCountCached + ' followers'}
    />
  )
}

function upscaleGoogleUrl(url: string) {
  // If the url ends in '=s96-c', upscale it to '=s200-c'
  if (url.endsWith('=s96-c')) {
    return url.replace(/=s96-c$/, '=s200-c')
  }
  return url
}

import Image from 'next/image'
import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import { useFollows } from 'web/hooks/use-follows'
import { useUser } from 'web/hooks/use-user'
import { useUserById } from 'web/hooks/use-user-supabase'

export default function CardsPage() {
  const user = useUser()
  const follows = useFollows(user?.id)
  return (
    <Page maxWidth="max-w-7xl font-grenze-gotisch">
      <h1 className="text-6xl">Manifold: the Gambling</h1>
      <Spacer h={4} />
      {/* Show a card for each follower in a grid, 5 cards wide */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {follows?.map((followId) => (
          <FollowCard followId={followId} />
        ))}
      </div>
    </Page>
  )
}

function FollowCard(props: { followId: string }) {
  const { followId } = props
  const user = useUserById(followId)
  if (!user) return null
  const avatarUrl = upscaleGoogleUrl(user.avatarUrl)
  return (
    <div className="relative h-[300px] w-[200px] cursor-zoom-in transition hover:z-10 hover:scale-150">
      <Image
        className="absolute top-0 left-0"
        src={avatarUrl}
        width={200}
        height={200}
        alt={user.name}
      />
      <Image
        className="absolute top-0 left-0"
        src="/cards/frame_green.png"
        width={200}
        height={400}
        alt="Frame"
      />
      <div className="line-clamp-1 absolute top-[165px] left-0 w-full bg-transparent text-center text-2xl font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]">
        {user.name}
      </div>
      <div className="line-clamp-4 absolute top-[210px] left-[15px] w-[170px] text-center text-sm leading-3">
        {user.bio}
      </div>
    </div>
  )
}

function upscaleGoogleUrl(url: string) {
  // If the url ends in '=s96-c', upscale it to '=s200-c'
  if (url.endsWith('=s96-c')) {
    return url.replace(/=s96-c$/, '=s200-c')
  }
  return url
}

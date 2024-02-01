import { getFullUserByUsername } from 'web/lib/supabase/users'
import type { Metadata, ResolvingMetadata } from 'next'
import UserPage from 'politics/app/[username]/user-page'
import { filterDefined } from 'common/util/array'
import Custom404 from 'politics/app/404/page'

export const revalidate = 60 // revalidate at most in seconds

export async function generateMetadata(
  props: { params: { username: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const user = await getFullUserByUsername(props.params.username)
  const previousImages = (await parent).openGraph?.images || []
  if (!user)
    return {
      title: `User @${props.params.username} not found`,
    }
  return {
    title: `${user.name} (@${user.username})`,
    description: user.bio ?? '',
    openGraph: {
      images: filterDefined([user.avatarUrl, ...previousImages]),
      url: `/${user.username}`,
    },
    robots:
      user.userDeleted || user.isBannedFromPosting
        ? 'noindex, nofollow'
        : undefined,
  }
}
export default async function Page(props: { params: { username: string } }) {
  const { username } = props.params
  const user = await getFullUserByUsername(username)
  if (!user) return <Custom404 />

  return <UserPage user={user} username={username} />
}

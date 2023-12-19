import { getUserByUsername } from 'web/lib/firebase/users'
import type { Metadata, ResolvingMetadata } from 'next'
import UserPage from 'politics/app/[username]/user-page'
import { filterDefined } from 'common/util/array'
import Custom404 from 'politics/app/404/page'

export const dynamicParams = true
export const revalidate = 15000 // revalidate at most every 5 seconds

export async function generateStaticParams() {
  return []
}

export async function generateMetadata(
  props: { params: { username: string } },
  parent: ResolvingMetadata
): Promise<Metadata> {
  const user = await getUserByUsername(props.params.username)
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
  const user = await getUserByUsername(username)
  if (!user) return <Custom404 />

  return <UserPage user={user} username={username} />
}

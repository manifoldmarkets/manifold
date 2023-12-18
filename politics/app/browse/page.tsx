import type { Metadata, ResolvingMetadata } from 'next'

type Props = {
  // aka queryparams
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata(
  { searchParams }: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  console.log('searchParams', searchParams)
  // fetch data
  const group = await fetch(
    `https://api.manifold.markets/v0/group?slug=${searchParams.topic}`
  ).then((res) => res.json())
  console.log('group', group)
  // optionally access and extend (rather than replace) parent metadata
  const previousImages = (await parent).openGraph?.images || []

  return {
    title: group.name,
    openGraph: {
      images: ['/dgg-logo.png', ...previousImages],
    },
  }
}

export default function Page({ searchParams }: Props) {
  return (
    <div>
      <h1>{searchParams.topic}</h1>
    </div>
  )
}

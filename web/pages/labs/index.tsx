import Masonry from 'react-masonry-css'
import { Page } from 'web/components/page'
import { SiteLink } from 'web/components/site-link'
import { Title } from 'web/components/title'

export default function LabsPage() {
  return (
    <Page>
      <Title text="Manifold Labs" />

      <Masonry
        breakpointCols={{ default: 2, 768: 1 }}
        className="-ml-4 flex w-auto"
        columnClassName="pl-4 bg-clip-padding"
      >
        <LabCard
          title="Dating docs"
          description="Browse dating docs or create your own"
          href="/date-docs"
        />
      </Masonry>
    </Page>
  )
}

const LabCard = (props: {
  title: string
  description: string
  href: string
}) => {
  const { title, description, href } = props
  return (
    <SiteLink
      href={href}
      className="group flex h-full w-full flex-col rounded-lg bg-white p-4 shadow-md transition-shadow duration-200 hover:no-underline hover:shadow-lg"
    >
      <h3 className="text-lg font-semibold group-hover:underline group-hover:decoration-indigo-400 group-hover:decoration-2">
        {title}
      </h3>
      <p className="mt-2 text-gray-600">{description}</p>
    </SiteLink>
  )
}

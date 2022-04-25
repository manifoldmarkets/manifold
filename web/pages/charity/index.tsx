import _ from 'lodash'
import { useState, useMemo } from 'react'
import Card from '../../components/charity/charity-card'
import { Col } from '../../components/layout/col'
import { Page } from '../../components/page'
import { Title } from '../../components/title'

const charities = [
  'QRI',
  'Redwood Research',
  '._.',
  'Center for Effective Altruism',
  'AllFed',
  'Against Malaria Foundation',
  'Institution for Long Long Loooong Loquacious Language (ILL)',
  'American Red Cross',
].map((name, i) => ({
  name,
  slug: name,
  website: 'https://www.google.com',
  ein: '123456789',
  photo: i === 4 ? '' : 'https://placekitten.com/200/200',
  blurb:
    i === 2
      ? 'short text'
      : "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.",
  raised: 4001,
}))
// TODO: actual data

export default function Charity() {
  const [query, setQuery] = useState('')
  const debouncedQuery = _.debounce(setQuery, 50)

  const filterCharities = useMemo(
    () => charities.filter((charity) => charity.name.includes(query)),
    [query]
  )

  return (
    <Page>
      <Col className="w-full rounded bg-white px-4 py-6 sm:px-8">
        <Col className="max-w-xl">
          <Title className="!mt-0" text="Donate to a charity" />
          <div className="mb-6 text-gray-500">
            Exchange your M$ for real dollars in the form of charity donations!
          </div>
          <input
            type="text"
            onChange={(e) => debouncedQuery(e.target.value)}
            placeholder="Search charities"
            className="input input-bordered mb-6 w-full"
          />
        </Col>
        <div className="grid max-w-xl grid-flow-row grid-cols-1 gap-3 lg:max-w-full lg:grid-cols-2 xl:grid-cols-3">
          {filterCharities.map((charity) => (
            <div key={charity.name}>
              <Card charity={charity} />
            </div>
          ))}
        </div>
        {filterCharities.length === 0 && (
          <div className="text-center text-gray-500">
            No charities match your search :(
          </div>
        )}
      </Col>
    </Page>
  )
}

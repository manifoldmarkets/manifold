import { Row } from './layout/row'
import { Linkify } from './linkify'

export function TagsList(props: { tags: string[] }) {
  const { tags } = props
  return (
    <Row className="gap-2 flex-wrap text-sm text-gray-500">
      {tags.map((tag) => (
        <div key={tag} className="bg-gray-100 px-1">
          <Linkify text={tag} gray />
        </div>
      ))}
    </Row>
  )
}

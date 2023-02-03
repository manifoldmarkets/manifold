import Masonry from 'react-masonry-css'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useMemberGroupIds, useTrendingGroups } from 'web/hooks/use-group'
import { useUser } from 'web/hooks/use-user'
import { GroupCard } from './groups'

export default function Explore() {
  const user = useUser()
  const groups = useTrendingGroups()
  const memberGroupIds = useMemberGroupIds(user) || []

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 px-4 pb-12 xl:w-[115%]">
        <Row className={'w-full items-center justify-between'}>
          <Title className="!mb-0" children="Trending groups" />
        </Row>

        <Masonry
          breakpointCols={{ default: 3, 1200: 2, 570: 1 }}
          className="-ml-4 flex w-auto self-center"
          columnClassName="pl-4 bg-clip-padding"
        >
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              className="mb-4 !min-w-[250px]"
              group={g}
              creator={null}
              user={user}
              isMember={memberGroupIds.includes(g.id)}
            />
          ))}
        </Masonry>
      </Col>
    </Page>
  )
}

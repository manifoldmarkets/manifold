import { useLoverByUserId } from 'love/hooks/use-lover'
import { useState, useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar, EmptyAvatar } from 'web/components/widgets/avatar'

export const LikesDisplay = (props: {
  likesGiven: string[]
  likesReceived: string[]
}) => {
  const { likesGiven, likesReceived } = props

  return (
    <Col className="gap-4">
      <Row className="items-center gap-2">
        <div className="text-lg font-semibold">Liked</div>
        <Row>
          {likesGiven.slice(0, 3).map((userId) => (
            <UserAvatar key={userId} userId={userId} />
          ))}
        </Row>
      </Row>
      <Row className="items-center gap-2">
        <div className="text-lg font-semibold">Liked by</div>
        {likesReceived.slice(0, 3).map((userId) => (
          <UserAvatar key={userId} userId={userId} />
        ))}
      </Row>
    </Col>
  )
}

const UserAvatar = (props: { userId: string }) => {
  const { userId } = props
  const lover = useLoverByUserId(userId)

  if (!lover || !lover.pinned_url) return <EmptyAvatar />
  return <Avatar avatarUrl={lover.pinned_url} />
}

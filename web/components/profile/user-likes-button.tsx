import { User } from 'common/user'
import { useState } from 'react'
import { TextButton } from 'web/components/text-button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { useUserLikedContracts } from 'web/hooks/use-likes'
import { SiteLink } from 'web/components/site-link'
import { Row } from 'web/components/layout/row'
import { XIcon } from '@heroicons/react/outline'
import { unLikeItem } from 'web/lib/firebase/likes'
import { contractPath } from 'web/lib/firebase/contracts'

export function UserLikesButton(props: { user: User; className?: string }) {
  const { user, className } = props
  const [isOpen, setIsOpen] = useState(false)

  const likedContracts = useUserLikedContracts(user.id)

  return (
    <>
      <TextButton onClick={() => setIsOpen(true)} className={className}>
        <span className="font-semibold">{likedContracts?.length ?? ''}</span>{' '}
        Likes
      </TextButton>
      <Modal open={isOpen} setOpen={setIsOpen}>
        <Col className="rounded bg-white p-6">
          <span className={'mb-4 text-xl'}>Liked Markets</span>
          <Col className={'gap-4'}>
            {likedContracts?.map((likedContract) => (
              <Row key={likedContract.id} className={'justify-between gap-2'}>
                <SiteLink
                  href={contractPath(likedContract)}
                  className={'truncate text-indigo-700'}
                >
                  {likedContract.question}
                </SiteLink>
                <XIcon
                  className="ml-2 h-5 w-5 shrink-0 cursor-pointer"
                  onClick={() => unLikeItem(user.id, likedContract.id)}
                />
              </Row>
            ))}
          </Col>
        </Col>
      </Modal>
    </>
  )
}

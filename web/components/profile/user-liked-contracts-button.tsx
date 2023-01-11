import { User } from 'common/user'
import { memo, useEffect, useState } from 'react'
import { TextButton } from 'web/components/buttons/text-button'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { SiteLink } from 'web/components/widgets/site-link'
import { Row } from 'web/components/layout/row'
import {
  getLikedContent,
  getLikedContentCount,
  SearchLikedContent,
} from 'web/lib/supabase/reactions'
import { Input } from 'web/components/widgets/input'

// Note: this button does NOT live update
export const UserLikedContractsButton = memo(
  function UserLikedContractsButton(props: { user: User; className?: string }) {
    const { user, className } = props
    const [isOpen, setIsOpen] = useState(false)

    const [likedContent, setLikedContent] = useState<
      SearchLikedContent[] | undefined
    >(undefined)
    const [likedContentCount, setLikedContentCount] = useState(0)
    const [query, setQuery] = useState('')
    useEffect(() => {
      getLikedContentCount(user.id).then(setLikedContentCount)
    }, [user.id])

    useEffect(() => {
      if (!isOpen || likedContent !== undefined) return
      getLikedContent(user.id).then(setLikedContent)
    }, [likedContent, isOpen, user.id])

    // filter by query
    const filteredLikedContent = likedContent?.filter((c) => {
      return (
        query === '' ||
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.text.toLowerCase().includes(query.toLowerCase())
      )
    })

    return (
      <>
        <TextButton onClick={() => setIsOpen(true)} className={className}>
          <span className="font-semibold">{likedContentCount}</span> Likes
        </TextButton>
        <Modal
          open={isOpen}
          setOpen={setIsOpen}
          size={'lg'}
        >
          <Col className="rounded bg-white p-6">
            <Row className={'ml-2 mb-4 items-center justify-between gap-4 '}>
              <span className={'text-xl'}>Likes</span>
              <Input
                placeholder="Search your likes"
                className={'!h-10'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Row>
            <Col className={'gap-4'}>
              {filteredLikedContent?.map((like) => (
                <Row
                  key={like.id}
                  className={'items-center justify-between gap-2'}
                >
                  <Col className={'w-full'}>
                    <SiteLink
                      href={like.slug}
                      className={'truncate text-sm text-indigo-700'}
                    >
                      {like.title}
                    </SiteLink>
                    {like.contentType === 'comment' && (
                    <SiteLink href={like.slug} className={'line-clamp-3 text-sm text-gray-700'}>
                        {like.text}
                      </SiteLink>
                    )}
                  </Col>
                </Row>
              ))}
            </Col>
          </Col>
        </Modal>
      </>
    )
  }
)

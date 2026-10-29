import clsx from 'clsx'
import { useState } from 'react'
import { Group } from 'common/group'
import { formatWithCommas } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  MOD_ACTION_TEXT_CLASS,
  ModActionBadge,
} from 'web/components/moderation/mod-action'
import { AboutEditor } from 'web/components/topics/about-editor'
import { AddContractToGroupModal } from 'web/components/topics/add-contract-to-group-modal'
import { TopicOptions } from 'web/components/topics/topic-options'
import { internalUnfollowTopic } from 'web/components/topics/topics-button'
import { TopicsSidebar } from 'web/components/topics/topics-sidebar'
import { useAsyncData } from 'web/hooks/use-async-data'
import { useIsFollowingTopic } from 'web/hooks/use-group-supabase'
import { useUser } from 'web/hooks/use-user'
import { api, updateGroup } from 'web/lib/api/api'

/**
 * The mods' view of the topic behind a sports page: what its topic page had
 * (rename, description, add markets, delete) and where it sits among the other
 * topics. Its topic page opens the sports page now, so mods edit it here.
 */
export function SportTopicPanel(props: { topic: Group }) {
  const { topic } = props
  const user = useUser()
  const { isFollowing, setIsFollowing } = useIsFollowingTopic(topic.slug)
  const [editingAbout, setEditingAbout] = useState(false)
  const [addingMarkets, setAddingMarkets] = useState(false)
  // Fetched on every visit, not kept for the session: the sidebar's edits
  // only change its own copy.
  const links = useAsyncData(topic.slug, (slug) =>
    api('group/:slug/groups', { slug })
  )

  return (
    <Col className="gap-4">
      <Row
        className={clsx(
          'items-center gap-1.5 px-1 text-xs',
          MOD_ACTION_TEXT_CLASS
        )}
      >
        <ModActionBadge />
        Only mods see this tab.
      </Row>
      <Row className="border-ink-200 bg-canvas-0 items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <Col className="min-w-0 gap-0.5">
          <span className="text-ink-900 truncate font-semibold">
            {topic.name}
          </span>
          <span className="text-ink-500 text-xs">
            {formatWithCommas(topic.totalMembers ?? 0)} followers ·{' '}
            {topic.privacyStatus} · /topic/{topic.slug} opens this page
          </span>
        </Col>
        <Row className="shrink-0 items-center gap-1">
          {user && (
            <Button
              size="xs"
              color="purple-outline"
              className="gap-1"
              onClick={() => setAddingMarkets(true)}
            >
              <ModActionBadge />
              Add markets
            </Button>
          )}
          <TopicOptions
            group={topic}
            user={user}
            isMember={!!isFollowing}
            unfollow={() => {
              setIsFollowing(false)
              internalUnfollowTopic(user, topic).catch(() =>
                setIsFollowing(true)
              )
            }}
            addAbout={() => setEditingAbout(true)}
            className="flex [&_*]:flex [&_button]:pr-2"
          />
        </Row>
      </Row>

      {/* Mounts once the links are in: it keeps its own copy to edit. */}
      {links ? (
        <TopicsSidebar
          key={topic.id}
          topicId={topic.id}
          above={links.above}
          below={links.below}
        />
      ) : (
        <Col className="gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-ink-100 h-28 animate-pulse rounded-xl" />
          ))}
        </Col>
      )}

      <Col className="gap-2">
        <h3 className="text-ink-700 px-1 text-sm font-semibold uppercase tracking-wide">
          Description
        </h3>
        {/* Not a flex column, so its Add button keeps its own width. */}
        <div>
          <AboutEditor
            initialContent={topic.about}
            onSave={(content) => updateGroup({ id: topic.id, about: content })}
            editing={editingAbout}
            setEditing={setEditingAbout}
            canEdit
            modAction
          />
        </div>
      </Col>

      {addingMarkets && user && (
        <AddContractToGroupModal
          group={topic}
          open={addingMarkets}
          setOpen={setAddingMarkets}
          user={user}
        />
      )}
    </Col>
  )
}

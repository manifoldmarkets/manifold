import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney } from 'common/util/format'
import { removeUndefinedProps } from 'common/util/object'
import Router from 'next/router'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { NoSEO } from 'web/components/NoSEO'
import { AmountInput } from 'web/components/widgets/amount-input'
import { TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { Subtitle } from 'web/components/widgets/subtitle'
import { Title } from 'web/components/widgets/title'
import { createPost } from 'web/lib/firebase/api'
import { postPath } from 'web/lib/firebase/posts'

const PRICE_PER_USER = 10

export default function CreateAdPage() {
  const editor = useTextEditor({ size: 'lg' })
  const [totalFunds, setTotalFunds] = useState<number>()

  const numViews = Math.floor((totalFunds ?? 0) / PRICE_PER_USER)

  const [submitting, setSubmitting] = useState(false)

  async function createAd() {
    if (!editor || totalFunds == 0) return

    setSubmitting(true)
    const newPost = removeUndefinedProps({
      type: 'ad',
      spend: totalFunds,
      content: editor.getJSON(),
      title: '[AD]',
    })

    const result = await createPost(newPost)
    Router.push(postPath(result.post.slug))
    setSubmitting(false)
  }

  return (
    <Page>
      <NoSEO />

      <Title>Create Advertisement</Title>
      <div className="my-6">
        <TextEditor editor={editor} />
      </div>

      <div>
        <Subtitle>Buy views</Subtitle>
        <AmountInput
          amount={totalFunds}
          onChange={setTotalFunds}
          label={ENV_CONFIG.moneyMoniker}
          disabled={submitting}
        />

        <div className="mt-2">
          Buying {numViews} views at {formatMoney(PRICE_PER_USER)}
        </div>
      </div>

      <Button
        onClick={createAd}
        disabled={numViews === 0}
        loading={submitting}
        className="mt-10"
      >
        Create
      </Button>
    </Page>
  )
}

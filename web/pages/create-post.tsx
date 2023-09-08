import { Page } from 'web/components/layout/page'
import { CreatePostForm } from 'web/components/posts/create-post'

export default function CreatePost() {
  return (
    <Page trackPageView={'create post page'}>
      <CreatePostForm />
    </Page>
  )
}

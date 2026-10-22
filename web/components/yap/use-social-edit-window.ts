import { useEffect, useState } from 'react'
import {
  isSocialPostEditable,
  SOCIAL_POST_EDIT_WINDOW_MS,
} from 'common/social-post'

export function useSocialEditWindow(createdTimeMs: number | undefined) {
  const [canEdit, setCanEdit] = useState(false)
  useEffect(() => {
    if (createdTimeMs === undefined) {
      setCanEdit(false)
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      const now = Date.now()
      setCanEdit(isSocialPostEditable(createdTimeMs, now))
      const remaining = createdTimeMs + SOCIAL_POST_EDIT_WINDOW_MS - now
      if (remaining > 0)
        timer = setTimeout(update, Math.min(remaining, 2 ** 31 - 1))
    }
    update()
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [createdTimeMs])
  return (
    canEdit &&
    createdTimeMs !== undefined &&
    isSocialPostEditable(createdTimeMs)
  )
}

import { Notification } from 'common/notification'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'

// Our Substack newsletter.
export const NEWSLETTER_NAME = 'Above The Fold'
export const NEWSLETTER_URL = 'https://news.manifold.markets'

// The same id for every user: user_notifications is keyed on
// (user_id, notification_id), so each user can only ever get one.
export const NEWSLETTER_NOTIFICATION_ID = 'newsletter-above-the-fold'

// Substack has no subscriber API and refuses signups posted from other sites,
// but its subscribe page pre-fills ?email=, so the reader only clicks Subscribe.
// Apple's private relay only forwards mail from senders registered with our
// Apple account, so we leave those addresses for the reader to fill in.
export function getNewsletterSubscribeUrl(email: string | undefined) {
  const params = ['utm_source=manifold', 'utm_medium=notification']
  if (email && !email.toLowerCase().endsWith('@privaterelay.appleid.com'))
    params.push(`email=${encodeURIComponent(email)}`)
  return `${NEWSLETTER_URL}/subscribe?${params.join('&')}`
}

// Pinned at the top of /notifications (markedAsRead: false) until the user
// clicks Subscribe or dismisses it.
export function getNewsletterNotification(
  userId: string,
  createdTime: number
): Notification {
  return {
    id: NEWSLETTER_NOTIFICATION_ID,
    userId,
    reason: 'admin',
    createdTime,
    isSeen: false,
    markedAsRead: false,
    sourceId: NEWSLETTER_NOTIFICATION_ID,
    sourceType: 'newsletter',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: '',
  }
}

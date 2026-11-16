import { Request, Response } from 'express'
import { getPrivateUser } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { DOMAIN } from 'common/envs/constants'
import { NOTIFICATION_DESCRIPTIONS } from 'common/notification'
import {
  getSavedNotificationDestinations,
  notification_preference,
} from 'common/user-notification-preferences'
import { trackPublicEvent } from 'shared/analytics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import {
  getNotificationSettingsUrl,
  getUnsubscribeUrl,
  verifyUnsubscribe,
} from 'shared/unsubscribe-links'

// GET (the link in an email) shows a confirmation page; POST to the same URL
// makes the change. Link scanners that prefetch email links only GET, and a
// POST to the link with the params in the query string is also the RFC 8058
// one-click form. Only a correctly signed link changes anything; any other
// link points to the notification settings page.
export const unsubscribe = async (req: Request, res: Response) => {
  const { id, type, sig } = req.query
  if (typeof id !== 'string' || !id || typeof type !== 'string' || !type) {
    res.status(400).send('Empty or invalid id or subscription type parameter.')
    return
  }
  if (!Object.prototype.hasOwnProperty.call(NOTIFICATION_DESCRIPTIONS, type)) {
    res.status(400).send('Invalid subscription type parameter.')
    return
  }
  const notificationSubscriptionType = type as notification_preference
  const description = NOTIFICATION_DESCRIPTIONS[notificationSubscriptionType]
  res.set('Cache-Control', 'no-store')

  if (!verifyUnsubscribe(id, type, sig)) {
    res.send(
      page(
        `<p>This link can't change your email settings. You can turn off
        <b>${escapeHtml(description.detailed)}</b> emails, or all emails, on
        your notification settings page.</p>
        <p><a href="${escapeHtml(
          getNotificationSettingsUrl(type)
        )}">Manage notification settings</a></p>`
      )
    )
    return
  }

  const optOutAllType: notification_preference = 'opt_out_all'
  const wantsToOptOutAll = notificationSubscriptionType === optOutAllType
  const thisUrl = getUnsubscribeUrl(id, notificationSubscriptionType)

  if (req.method !== 'POST') {
    const what = wantsToOptOutAll
      ? 'all non-essential Manifold emails'
      : `emails about: <b>${escapeHtml(description.detailed)}</b>`
    res.send(
      page(
        `<p>Unsubscribe from ${what}?</p>
        <form method="post" action="${escapeHtml(thisUrl)}">
          <button type="submit">Unsubscribe</button>
        </form>`
      )
    )
    return
  }

  const user = await getPrivateUser(id)

  if (!user) {
    res.send(page(`<p>This account is not subscribed to these emails.</p>`))
    return
  }

  const previousDestinations = [
    ...getSavedNotificationDestinations(
      user.notificationPreferences,
      notificationSubscriptionType
    ),
  ]

  let newDestinations = previousDestinations
  if (wantsToOptOutAll) newDestinations.push('email')
  else
    newDestinations = previousDestinations.filter(
      (destination) => destination !== 'email'
    )

  const update: Partial<PrivateUser> = {
    notificationPreferences: {
      ...user.notificationPreferences,
      [notificationSubscriptionType]: newDestinations,
    },
  }

  await trackPublicEvent(id, 'unsubscribe from emails', {
    type: notificationSubscriptionType,
  })

  const pg = createSupabaseDirectClient()
  await updatePrivateUser(pg, id, update)

  const settingsLink = `<p><a href="${escapeHtml(
    getNotificationSettingsUrl()
  )}">Manage the rest of your notification settings</a></p>`

  if (wantsToOptOutAll) {
    res.send(
      page(
        `<p>You've opted out of all non-essential email notifications.</p>
        ${settingsLink}`
      )
    )
    return
  }

  const optOutAllUrl = getUnsubscribeUrl(id, optOutAllType)
  res.send(
    page(
      `<p>You've been unsubscribed from emails about:
      <b>${escapeHtml(description.detailed)}</b></p>
      <p><a href="${escapeHtml(
        optOutAllUrl
      )}">Unsubscribe from all emails</a></p>
      ${settingsLink}`
    )
  )
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const page = (body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Unsubscribe from Manifold emails</title>
  <style>
    body { margin: 0; background: #F4F4F4; font-family: Arial, Helvetica, sans-serif; color: #000; }
    main { max-width: 550px; margin: 24px auto; padding: 24px; background: #fff; }
    img { display: block; width: 100%; height: auto; margin-bottom: 16px; }
    p { font-size: 18px; line-height: 24px; }
    button { font-size: 18px; padding: 10px 20px; border: 0; border-radius: 6px;
      background: #4337c9; color: #fff; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <a href="https://${DOMAIN}"><img alt="Manifold" src="https://${DOMAIN}/logo-banner.png"></a>
    ${body}
  </main>
</body>
</html>
`

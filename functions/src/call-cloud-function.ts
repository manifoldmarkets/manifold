import * as admin from 'firebase-admin'

import fetch from './fetch'

export const callCloudFunction = (functionName: string, data: {} = {}) => {
  const projectId = admin.instanceId().app.options.projectId

  let url = `https://us-central1-${projectId}.cloudfunctions.net/${functionName}`

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  }).then((response) => response.json())
}

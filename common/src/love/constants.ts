import { PROD_MANIFOLD_LOVE_GROUP_ID } from 'common/supabase/groups'

const isProd = () => {
  // mqp: kind of hacky rn. the first clause is for cloud run API service,
  // second clause is for local scripts and cloud functions
  if (process.env.ENVIRONMENT) {
    return process.env.ENVIRONMENT == 'PROD'
  } else {
    // ian: this is untested, but might work for local scripts and cloud functions
    // james: doesn't work for local web dev
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin')
    return admin.app().options.projectId === 'mantic-markets'
  }
}

export const manifoldLoveUserId = isProd()
  ? 'tRZZ6ihugZQLXPf6aPRneGpWLmz1'
  : 'RlXR2xa4EFfAzdCbSe45wkcdarh1'
export const manifoldLoveRelationshipsGroupId = isProd()
  ? PROD_MANIFOLD_LOVE_GROUP_ID
  : '77df8782-34b7-4daa-89f4-a75c8ea844d4'

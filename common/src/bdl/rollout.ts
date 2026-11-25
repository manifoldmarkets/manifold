/** Set on the API and scheduler processes, and at build time for the web preview. */
export const isSportsBdlEnabled = () =>
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED === 'true'

import { useEffect } from 'react'

export const useReloadIfClientOld = () => {
  const deploymentId = process.env.NEXT_PUBLIC_VERCEL_URL

  useEffect(() => {
    getDeploymentId().then((newDeploymentId) => {
      if (deploymentId && newDeploymentId && newDeploymentId !== deploymentId) {
        console.log(
          'Reloading b/c deployment id changed',
          deploymentId,
          '=>',
          newDeploymentId
        )
        window.location.reload()
      }
    })
  }, [])
}

const getDeploymentId = async () => {
  const json = await fetch('/api/v0/deployment-id').then((res) => res.json())
  return json.deploymentId
}

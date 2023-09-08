import { useEffect } from 'react'

export const useReloadIfClientOld = () => {
  const deploymentId = process.env.PUBLIC_NEXT_VERCEL_URL

  useEffect(() => {
    getDeploymentId().then((newDeploymentId) => {
      console.log(
        'currDeploymentId',
        deploymentId,
        'newDeploymentId',
        newDeploymentId
      )
      if (deploymentId && newDeploymentId && newDeploymentId !== deploymentId) {
        console.log(
          'Reloading b/c of deployment id change',
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

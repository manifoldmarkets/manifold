Client-common is the common code for the client. It can import from common/ and is imported by clients in the web/ and mani/ folders.

Firebase auth needs to be initialized in the each separate client directory, e.g. mani/lib/firebase/init.ts and web/lib/firebase/init.ts, then passed to any functions requiring firebase auth/storage in client-common. For example, the firebase auth is initialized in mani and web, then passed to the api call in client-common/src/lib/api.ts:

```ts
export async function apiWithAuth<P extends APIPath>(
  path: P,
  auth: Auth,
  params: APIParams<P> = {}
) {
  const pathProps = API[path]
  const preferAuth = 'preferAuth' in pathProps && pathProps.preferAuth
  // If the api is authed and the user is not loaded, wait for the user to load.
  if ((pathProps.authed || preferAuth) && !auth.currentUser) {
    let i = 0
    while (!auth.currentUser) {
      i++
      await sleep(i * 10)
      if (i > 30) {
        console.error('User did not load after 30 iterations')
        break
      }
    }
  }

  return (await callWithAuth(
    formatApiUrlWithParams(path, params),
    pathProps.method,
    auth,
    params
  )) as Promise<APIResponse<P>>
}
```

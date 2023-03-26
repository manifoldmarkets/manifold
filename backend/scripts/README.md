# scripts

Any code that people have found it convenient to write and run against our backend stuff.

## Set up

Follow Setting up Authentication under [/functions/README](../functions/README.md#setting-up-authentication).

## Example script

Simply import `runScript` and pass it a function.

```typescript
import { runScript } from 'run-script'
import { DAY_MS } from 'common/util/time'
import { getRecentContractLikes } from 'shared/supabase/likes'

if (require.main === module) {
  runScript(async ({ db }) => {
    const weekAgo = Date.now() - 7 * DAY_MS
    console.log(await getRecentContractLikes(db, weekAgo))
  })
}
```

## Running a script

Make sure you are pointing at the Firebase you intend to:

```shell
$ firebase use dev
```

Use [ts-node](https://www.npmjs.com/package/ts-node) to run whatever you want:

```shell
$ cd backend/scripts
$ ts-node script.ts
```

Or if you don't want to use `ts-node` you can compile and run them with Node:

```shell
$ yarn build && node lib/script.js
```

### Environment variables

Secret keys are automatically loaded into `process.env` when you use the `runScript` function.

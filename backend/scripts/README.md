# scripts

Any code that people have found it convenient to write and run against our backend stuff.

## Set up

Follow Setting up Authentication under [/functions/README](../functions/README.md#setting-up-authentication).

### Environment variables

Copy the keys from the google secrets page

- Dev: https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets
- Prod: https://console.cloud.google.com/security/secret-manager?project=mantic-markets

Then, save them locally in e.g. `~/.zshrc` or `~/.bashrc`:

```
export SUPABASE_KEY=ABCDE12345
export SUPABASE_PASSWORD=12345ABCD
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

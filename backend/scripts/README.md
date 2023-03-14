# scripts

Any code that people have found it convenient to write and run against our backend stuff.

## Setting up authentication

Generate private keys from the Google service account management page:

- Dev: https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk

- Prod: https://console.firebase.google.com/u/0/project/dev-mantic-markets/settings/serviceaccounts/adminsdk

Set `GOOGLE_APPLICATION_CREDENTIALS_PROD` or `GOOGLE_APPLICATION_CREDENTIALS_DEV` in your shell to the path of the key file.

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

## Environment variables

Copy the keys from the google secrets file:

Dev: https://console.cloud.google.com/security/secret-manager?project=dev-mantic-markets
Prod: https://console.cloud.google.com/security/secret-manager?project=mantic-markets


Then, save them locally in e.g. `~/.zshrc` or `~/.bashrc`:

```
export SUPABASE_KEY=ABCDE12345
export SUPABASE_PASSWORD=12345ABCD
```

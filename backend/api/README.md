# api

One function to rule them all, one docker image to bind them

## Setup

You must have set up the `gcloud` cli following the [functions/README](../functions/README.md#installing-for-local-development).

You must also have set up the Supabase environment variables following [script/README](../scripts/README.md#environment-variables) (TODO: James to remove this requirement)

## Test

In root directory `./dev.sh [dev|prod]` will run the api with hot reload, along with all the other backend and web code.

## Deploy

Run `./deploy.sh [dev|prod]` in this directory

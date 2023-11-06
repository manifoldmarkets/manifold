# feedmaker

Service responsible for looking at recent contracts and market movements,
and generating user feeds by inserting loads of entries into the `user_feed` table.

## To deploy

You must have set up the `gcloud` cli following the [functions/README](../functions/README.md#installing-for-local-development).

`./deploy-feedmaker.sh [dev|prod]` will deploy to the respective environments.

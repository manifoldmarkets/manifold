# replicator

This is the service that is responsible for taking all interesting Firestore
writes and replicating them to Supabase. It's mainly separate from the functions
because of some bugs in `firebase-tools` handling of pub/sub functions that
prohibit us from implementing it like that.

## To deploy

You must have set up the `gcloud` cli following the [functions/README](../functions/README.md#installing-for-local-development).

`./deploy.sh [dev|prod]` will deploy to the respective environments.

## Related

Two other things are used to tie this together:

- A pub/sub pull subscription that the service can get writes from. You can see this in the GCP console, e.g. https://console.cloud.google.com/cloudpubsub/subscription/detail/supabaseReplicationPullSubscription?project=mantic-markets

- A scheduled job that POSTs to the `replay-failed` endpoint sometimes (currently once per minute), e.g. https://console.cloud.google.com/cloudscheduler/jobs/edit/us-east4/replayFailedFirestoreWrites?project=mantic-markets

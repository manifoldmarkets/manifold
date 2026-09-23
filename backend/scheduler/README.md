# scheduler

Service responsible for running scheduled jobs over Manifold data.

## To deploy

You must have set up the `gcloud` cli following the [functions/README](../functions/README.md#installing-for-local-development).

Both DEV and PROD use two instances. Deploy the API first, then from this
folder run `./deploy-scheduler.sh [dev|prod] main` followed by
`./deploy-scheduler.sh [dev|prod] perps` (or `deploy-scheduler-windows.sh`
from Git Bash). An omitted target or `all` is rejected before any deployment.

The `scheduler` instance runs `SCHEDULER_JOBS=main`; `scheduler-perps` runs
`SCHEDULER_JOBS=perps`. Deploy main first when switching an environment from
a single instance, so it stops its PERP jobs before the dedicated instance
starts them. The `all` job set remains available for local development.

Only `scheduler-perps` starts `update-oracle-feeds` (the shared 2-second tick,
including all MNX feeds and their health updates), `update-perps` (hourly
funding and fallback oracle work), and the OpenRouter, Trump approval,
VoteHub and fear/greed publishers. Main runs the batch jobs. This split is
applied before cron construction, so excluded jobs cannot start timers.
MNX adds no separate job and deploying it creates no markets.
See the [MNX rollout checklist](../../perps-launch-runbook.md#mnx-rollout-dev-and-prod)
for API compatibility, environment checks and launch gates.

## Operating

GCP instances in our projects use the Google "OS login" functionality. To SSH into them, you will need to associate an SSH key with your Google account (perhaps on both `dev-mantic-markets` and `mantic-markets`). If you do

```
$ gcloud compute ssh scheduler
```

it should prompt you to make a new key. Or to use an existing key you have, you can do:

```
$ gcloud compute os-login ssh-keys add --key-file=KEY_FILE_PATH --project=PROJECT
```

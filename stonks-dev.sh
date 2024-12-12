#!/bin/bash

ENV=${1:-dev}
DEBUG=${2:-false}

case $ENV in
    dev)
      FIREBASE_PROJECT=dev
      NEXT_ENV=DEV ;;
    prod)
      FIREBASE_PROJECT=prod
      NEXT_ENV=PROD ;;
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

firebase use $FIREBASE_PROJECT

API_COMMAND="dev"
if [ "$DEBUG" = "true" ]; then
    API_COMMAND="debug"
fi

# Run all services concurrently
npx concurrently \
    -n API,STONKS,TS \
    -c white,magenta,cyan \
    "cross-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
              yarn --cwd=backend/api $API_COMMAND" \
    "cross-env NEXT_PUBLIC_API_URL=localhost:8088 \
              NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
              yarn --cwd=stonks dev" \
    "cross-env yarn --cwd=stonks ts-watch"
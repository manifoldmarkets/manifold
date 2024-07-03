#!/bin/bash

ENV=${1:-dev}
PROJECT=$2
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

npx concurrently \
    -n API,NEXT,TS \
    -c white,magenta,cyan \
    "cross-env NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
                      yarn --cwd=backend/api dev" \
    "cross-env NEXT_PUBLIC_API_URL=localhost:8088 \
              NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
              yarn --cwd=web serve" \
    "cross-env yarn --cwd=web ts-watch"

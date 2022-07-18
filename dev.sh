#!/bin/bash

ENV=${1:-dev}
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

# run all of: local functions, next.js dev server, typechecking on web project
npx concurrently \
    -n FUNCTIONS,NEXT,TS \
    -c white,magenta,cyan \
    "yarn --cwd=functions dev" \
    "cross-env NEXT_PUBLIC_FUNCTIONS_URL=http://localhost:8080 \
               NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
               yarn --cwd=web serve" \
    "cross-env yarn --cwd=web ts-watch"

#!/bin/bash

ENV=${1:-dev}
case $ENV in
    dev)
      FIREBASE_PROJECT=dev
      NEXT_ENV=DEV ;;
    prod)
      FIREBASE_PROJECT=prod
      NEXT_ENV=PROD ;;
    localdb)
      FIREBASE_PROJECT=dev
      NEXT_ENV=DEV
      EMULATOR=true ;;
    *)
      echo "Invalid environment; must be dev, prod, or localdb."
      exit 1
esac

firebase use $FIREBASE_PROJECT

if [ ! -z $EMULATOR ]
then
  npx concurrently \
      -n FIRESTORE,FUNCTIONS,NEXT,TS \
      -c green,white,magenta,cyan \
      "yarn --cwd=backend/functions localDbScript" \
      "cross-env FIRESTORE_EMULATOR_HOST=localhost:8080 yarn --cwd=backend/functions dev" \
      "cross-env NEXT_PUBLIC_FUNCTIONS_URL=http://localhost:8088 \
               NEXT_PUBLIC_FIREBASE_EMULATE=TRUE \
               NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
               yarn --cwd=web serve" \
      "cross-env yarn --cwd=web ts-watch"
else
  npx concurrently \
      -n FUNCTIONS,NEXT,TS \
      -c white,magenta,cyan \
      "yarn --cwd=backend/functions dev" \
      "cross-env NEXT_PUBLIC_FUNCTIONS_URL=http://localhost:8088 \
               NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
               yarn --cwd=web serve" \
      "cross-env yarn --cwd=web ts-watch"
fi

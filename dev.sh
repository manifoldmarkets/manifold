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
    localdb)
      echo "WARNING: localdb is deprecated, please use dev instead."
      FIREBASE_PROJECT=dev
      NEXT_ENV=DEV
      EMULATOR=true ;;
    *)
      echo "Invalid environment; must be dev or prod."
      exit 1
esac

DIR=web
if [ "$PROJECT" == "love" ]; then
    export IS_MANIFOLD_LOVE=true
    DIR=love
    echo "Building Manifold.love..."
fi

firebase use $FIREBASE_PROJECT

if [ ! -z $EMULATOR ]
then
  npx concurrently \
      -n FIRESTORE,API,NEXT,TS \
      -c green,white,magenta,cyan \
      "yarn --cwd=backend/functions localDbScript" \
      "yarn --cwd=backend/api dev" \
      "cross-env NEXT_PUBLIC_API_URL=http://localhost:8088
               NEXT_PUBLIC_FIREBASE_EMULATE=TRUE \
               NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
               yarn --cwd=${DIR} serve" \
      "cross-env yarn --cwd=${DIR} ts-watch"
else
  npx concurrently \
      -n API,NEXT,TS \
      -c white,magenta,cyan \
      "yarn --cwd=backend/api dev" \
      "cross-env NEXT_PUBLIC_API_URL=http://localhost:8088 \
               NEXT_PUBLIC_FIREBASE_ENV=${NEXT_ENV} \
               yarn --cwd=${DIR} serve" \
      "cross-env yarn --cwd=${DIR} ts-watch"
fi

#!/usr/bin/env bash

if [ "$NEXT_PUBLIC_FIREBASE_ENV" == "PROD"  ];
then
  echo "Switching to Firebase Production environment"
  cp -a "configs/prod/." ./
  mv "GoogleService-Info.plist" ios/Manifold
else
  echo "Switching to Firebase Dev environment"
  cp -a "configs/dev/." ./
  mv "GoogleService-Info.plist" ios/Manifold
fi
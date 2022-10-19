#!/usr/bin/env bash

if [ "$NEXT_PUBLIC_FIREBASE_ENV" == "PROD"  ];
then
  echo "Switching to Firebase Production environment"
  cp -a "configs/prod/." ./
#  yes | cp -rf "js/config/firebase_production/GoogleService-Info.plist" ios/appfolder
else
  echo "Switching to Firebase Dev environment"
  cp -a "configs/dev/." ./
#  yes | cp -rf "js/config/firebase_development/GoogleService-Info.plist" ios/appfolder
fi
We're using Expo to help with android and ios builds. You can find more information about Expo here: https://docs.expo.dev/introduction/expo/
## Installing
- The `native/` directory is not part of the yarn workspace, so you have to run `yarn` in the `native/` directory to install dependencies.
- You will need to install the Expo CLI globally: `npm install -g expo-cli`
- You need the `SENTRY_AUTH_TOKEN` set on your env, ask Ian
- You need to make sure the Manifold Markets, Inc. team is set as the signer for app builds in Xcode - open up ios directory in Xcode and set the signing account.
- You need to register your device for development builds with Expo and install a provisioning profile, see the [Running a build](https://docs.expo.dev/development/build/) section with `eas device:create`

## Configuration
- `app.json` and `app.config.js` are the configuration files that determine basic functioning of the app. If you change them you'll have to clean your `android` and `ios` folders via `yarn clean`

## Developing  
1. Connect your phone to your computer  
2. **iOS**:   
   - `yarn build:ios:client:prod` or `yarn build:ios:client:dev` to build a dev client and drag it onto your iPhone to install it.
   - `yarn start` and scan the QR code with camera
   - Keep a dev client build in the native directory so you can just drag and drop them onto your phone to install them
3. **Android**:
   - `yarn android:dev` or `yarn android:prod` builds and installs the dev client on your device automatically
   - Scan the QR code with the app (it opens automatically after installing)

- **Note:** when switching between dev and prod you'll have to run `yarn clear` & Ctrl+C to clear the env variable.
- Want to see console logs? (Only works on android):
   - `$ ngrok http 3000` in a separate terminal
   - Change the `baseUri` in `App.tsx` to the ngrok url
   - `$ yarn android:prod` to start the app on your device
   - On your computer, navigate to `chrome://inspect/#devices` in chrome and click inspect on the app
- Want to see app logs of a production build? (Only works on android):
   - `$ adb logcat --pid=$(adb shell pidof -s com.markets.manifold)`


## Building  
- You'll need to get Android signing credentials from Ian (located [here](https://drive.google.com/drive/folders/155gaiY97oY0IkQvHGKHqKbXEeO4LaVCe?usp=sharing)) to properly sign android builds for the google play store. You'll probably need to be added to the Apple Business developer team when we get that to build ios apps.    
- After changing anything in the `app.config.js` or `app.json` you'll want to run `npx expo prebuild` to clear the android and ios folders
- Before every build we clean and reset the git tree so you'll want to make sure any changes are committed. The dialog will ask you to confirm this.   
- After every build your git tree may be dirty with build artifacts. I tried removing these and ended up down in a git-sponsored nightmare, so I wouldn't advise trying to edit these files out of the git history unless you really know what you're doing. 
- The following commands build the binaries locally by default. If you remove the `--local` flag it will build in the EAS/Expo cloud, (this tends to be much slower, though).
- Before every submission to the app store you'll want to bump the following fields in `app.json`:
  - `expo.version` 
  - `expo.ios.buildNumber` 
  - `expo.android.versionCode` 


**For Internal Testing**    
`yarn build:android:preview` 
- Builds an Android APK for previewing on a device
- `adb install build_name_here.apk` after it's built to install

`yarn build:ios:prod`
- Builds an iOS IPA that you can upload to TestFlight

`yarn build:ios:preview`  
- Builds an iOS IPA for previewing on a device
- Drag and drop onto your plugged in iPhone Finder window to install

**External**  
`yarn build:android:prod`
- Builds an Android App Bundle for Google Play distribution
- Upload to Google Play Console

`yarn build:ios:prod`
- Builds an iOS IPA for App Store distribution
- I think we use Transporter once we have our Apple Business Developer account set up

### OTA updates
`eas update --branch default` to publish an over-the-air update to production 

### Adding Environment Variables
- Set the variable in `package.json` (used for local development aka `yarn ios:prod`)  
- Add the key-value pair to the `extra.eas` object in `app.config.js` with value `process.env.YOUR_ENV_VARIABLE` 
- Set the build variable in `eas.json` for the profile you want (used for eas builds aka `yarn build:ios:prod`)
- Reference it in js: `Constants.expoConfig?.extra?.eas.YOUR_ENV_VARIABLE`
- Run `yarn clear` to clear the env variable between builds

# Icons
find icons [here](https://icons.expo.fyi/)

## Notes
- The dev and prod version of the app use the same application id (`com.markets.manifold`). This may not be not ideal but it works.
- Notifications on android dev I think won't work bc we have to use Firebase's server signing key to send push notifications and I just linked our application id (com.markets.manifold) to the prod server signing key. To fix I'd have to have a separate application id for dev, which I could do but you can just test on prod
- Try out sending push notifications [here](https://expo.dev/notifications) (using the `pushToken` from your `private-user` object)
- Google play release console [here](https://play.google.com/console/u/1/developers/4817631028794628961/app/4973740210331758857/releases/overview)

## Monitoring
- [Sentry](https://sentry.io/organizations/manifold-markets/projects/react-native/?issuesType=new&project=4504040585494528)

### Problems with building android after deleting `android/`
- `However we cannot choose between the following variants of project :react-native-iap: - amazonDebugRuntimeElements - playDebugRuntimeElements`
  - Add `missingDimensionStrategy 'store', 'play'` to `android/app/build.gradle` in the `defaultConfig` section
- `error: cannot find symbol import com.markets.BuildConfig;`
  - Add `namespace "com.markets.manifold"` in place of `namespace "com.manifold"` to `app/build.gradle`
  - Add `package com.markets.manifold;` in place of incorrect package at the top of `native/android/app/src/release/java/com/manifold/ReactNativeFlipper.java` 

## Troubleshooting
- getting an errors on build/install? like `Error: spawn .../manifold/native/android/gradlew EACCES`
  - Delete the `android` or `ios` folders or run `yarn clean` and try again.
- environment variables not working? like `process.env.API_URL` is undefined
  - Try running `yarn clear` and ctrl+c to clear the env variable and try again
- When in doubt: `yarn clean`
- Fastlane build failing? Could be a malformed import
- Pod install erroring out?
  - I had to reinstall cocoapods via [these instructions](https://github.com/expo/expo/issues/20707#issuecomment-1377790160)
  
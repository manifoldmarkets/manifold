We're using Expo to help with android and ios builds. You can find more information about Expo here: https://docs.expo.dev/introduction/expo/
## Installing
- The `native/` directory is not part of the yarn workspace, so you have to run `yarn` in the `native/` directory to install dependencies.
- You will need to install the Expo CLI globally: `npm install -g expo-cli`

## Configuration
- `app.json` and `app.config.js` are the configuration files that determine basic functioning of the app. If you change them you'll have to clean your `android` and `ios` folders via `yarn clean`

## Developing  
1. Connect your phone to your computer  
2. `yarn android:dev` or `yarn ios:dev` or `yarn ios:prod`   
3. Scan the QR code with the app (it opens automatically after installing)    
**Note:** when switching between dev and prod you'll have to run `yarn clear` & Ctrl+C to clear the env variable.  


## Building  
- You'll need to get Android signing credentials from Ian (located [here](https://drive.google.com/drive/folders/155gaiY97oY0IkQvHGKHqKbXEeO4LaVCe?usp=sharing)) to properly sign android builds for the google play store. You'll probably need to be added to the Apple Business developer team when we get that to build ios apps.    
- After changing anything in the `app.config.js` you'll want to run `npx expo prebuild` to clear the android and ios folders
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

## OTA updates
`eas update` to publish an OTA update via EAS


## Notes
- The dev and prod version of the app use the same application id (`com.markets.manifold`). This may not be not ideal but it works.
- Notifications on android dev I think won't work bc we have to use Firebase's server signing key to send push notifications and I just linked our application id (com.markets.manifold) to the prod server signing key. To fix I'd have to have a separate application id for dev, which I could do but you can just test on prod
- Try out sending push notifications [here](https://expo.dev/notifications) (using the `pushToken` from your `private-user` object)
- Google play release console [here](https://play.google.com/console/u/1/developers/4817631028794628961/app/4973740210331758857/releases/overview)

## Monitoring
- [Sentry](https://sentry.io/organizations/manifold-markets/projects/react-native/?issuesType=new&project=4504040585494528)

## Troubleshooting
- getting an errors on build/install? like `Error: spawn .../manifold/native/android/gradlew EACCES`
  - Delete the `android` and `ios` folders in `native/` and try again.
- environment variables not working? like `process.env.API_URL` is undefined
  - Try running `yarn clear` and ctrl+c to clear the env variable and try again
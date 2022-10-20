## Debugging  

`yarn ios:dev`  
`yarn android:dev`  
`yarn ios:prod`  
**Note:** when switching between dev and prod you'll have to run `yarn clear` & Ctrl+C to clear the env variable.



## Building  
**Note:** You'll need to get credentials from Ian to build Android apps. You'll probably need to be added to the Apple Business developer team when we get that to build ios apps.   
**Note 2:** Before every build we clean and reset the git tree so you'll want to make sure any changes are commited. The dialog will ask you to confirm this.  
**Note 3:** After every build your git tree will be dirty with build artifacts. I tried removing these and ended up down in a git-sponsored nightmare hell so I wouldn't advise trying to edit these files out of the git history unless you really know what you're doing.   
**Internal**    
`yarn build:android:preview` 
- Build an Android APK for previewing on a device
- `adb install build_name_here.apk` to install

`yarn build:ios:preview`  
- Build an iOS IPA for previewing on a device
- Drag and drop in Finder on plugged in iPhone to install

**External**  
`yarn build:android:prod`
- Build an Android App Bundle for Google Play distribution
- Upload to Google Play Console

`yarn build:ios:prod`
- Build an iOS IPA for App Store distribution
- I think we use Transporter once we have our Apple Business Developer account set up


## Notes
- Notifications on android dev I think won't work bc we have to use Firebase's server signing key to send push notifications and I just linked our application id (com.markets.manifold) to the prod server signing key. To fix I'd have to have a separate application id for dev, which I could do but you can just test on prod
- 
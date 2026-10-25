# Android and website builds

Hop Rider (`com.hop.rider`) and Hop Captain (`com.hop.captain`) bundle the existing React screens in separate Capacitor Android apps. Admin remains a website. The Go backend is common; Android uses native HTTP with app-specific HttpOnly session cookies, while browsers retain the same-origin proxy and SSE paths. Android foreground screens use the existing polling recovery path; configured Firebase notifications cover background alerts.

## Build

Use Node 24+, a full JDK 21 (including `javac` and `jlink`), Android SDK platform 36 and accepted SDK licenses. Gradle wrapper 8.14.3 is pinned with its SHA-256 checksum. On this Mac the full JDK is `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`; GoLand's bundled runtime is not a full Android build JDK.

From `hop-platform/web`:

```sh
npm ci
npm run android:rider -- --apk
npm run android:captain -- --apk
```

The scripts build the corresponding React app in `android` mode, copy its assets with `cap sync`, and assemble its APK. Outputs:

- `mobile/rider/android/app/build/outputs/apk/debug/app-debug.apk`
- `mobile/captain/android/app/build/outputs/apk/debug/app-debug.apk`

To independently check Android code, run `./gradlew assembleDebug lintDebug` from each app's `android` directory, with `JAVA_HOME` and `ANDROID_HOME` set. A successful APK build alone does not establish permission, sign-in, push, or screen-off tracking behavior on a physical device.

GitHub Android builds read repository variables `RIDER_GOOGLE_MAPS_API_KEY`, `RIDER_GOOGLE_MAP_ID`, `CAPTAIN_GOOGLE_MAPS_API_KEY`, and `CAPTAIN_GOOGLE_MAP_ID`; private local env files are not uploaded to CI.

## Local device setup

Each app reads `apps/<app>/.env.android` plus private `.env.android.local` overrides. Debug defaults point to the existing app gateways on localhost:5173/5174. A phone's localhost is the phone, so connect it by USB and forward the app and local Keycloak ports:

```sh
adb reverse tcp:5173 tcp:5173
adb reverse tcp:5174 tcp:5174
adb reverse tcp:8180 tcp:8180
adb install -r mobile/rider/android/app/build/outputs/apk/debug/app-debug.apk
adb install -r mobile/captain/android/app/build/outputs/apk/debug/app-debug.apk
```

Start the updated Go API, apply all migrations through 028, run the rider/captain gateways and configure their OIDC callbacks as described in SEPARATE-DEPLOYMENTS.md. An old Go binary will not have `/auth/mobile/exchange` or the Android push endpoints. The native apps do not connect to a separate database or bypass account/driver validation.

For a deployed backend, set `VITE_MOBILE_API_URL` to that app's HTTPS gateway origin. The origin must agree with the backend's `RIDER_ORIGIN` / `CAPTAIN_ORIGIN`. Native requests retain the same CSRF checks. Never put database, OIDC client, Firebase server or payment secrets in Vite environment files.

## Authentication

Phone OTP uses the existing server endpoints over native HTTP. OIDC opens the system browser, returns through the configured app gateway callback, then deep-links to `com.hop.rider://auth/callback` or `com.hop.captain://auth/callback`. Only a 60-second, single-use grant appears in the link. The app exchanges it with its original SHA-256 proof verifier; session secrets remain in native cookie storage. A cancelled or killed sign-in can be restarted safely. The OIDC provider continues to register HTTPS gateway callbacks, not custom app schemes.

## Location and push

Both apps request location when the existing screens need it. Captain requests precise location before going online. A user-started foreground service displays an ongoing notification and posts location independently of WebView timers. Going offline or signing out stops it. The service does not automatically restart after force-stop or task dismissal; server location freshness still expires. Test Android power-saving and permission-denial behavior before live rides.

Firebase is optional for building debug APKs but required for background push delivery:

1. Register the two package IDs as separate Android apps in your Firebase project.
2. Place each app's own `google-services.json` in its `mobile/<app>/android/app/` folder. These files are ignored by Git.
3. Mount a Firebase service-account JSON file privately on the API host, then set `FCM_SERVICE_ACCOUNT_FILE` to its path. Give the service account only the required FCM send permission. Never copy this file into frontend assets or an APK.
4. Apply migrations 026–027 and restart the API, rebuild both APKs, and enable alerts inside each app. Notification tokens are account-bound and detached on sign-out.

Without Firebase configuration, ordinary in-app polling still works; closed-app push delivery does not. Both Android apps now default to Google Maps through the shared Maps JavaScript renderer, matching the websites. Set VITE_GOOGLE_MAPS_API_KEY and VITE_GOOGLE_MAP_ID independently in each app’s ignored .env.android.local; the existing local browser credentials have been copied there for development. Builds reject a missing Google Maps key. These are JavaScript browser keys, not Maps SDK for Android keys. Enable billing and Maps JavaScript API (plus the Places API used by address autocomplete), and use a JavaScript Map ID. The bundled WebView origin is https://localhost; website restrictions must support its actual referrer. Google notes that referrer restrictions can fail for bundled WebView resources, so verify on a device before release rather than removing restrictions. Google authentication failures retain the existing OSM fallback. See https://developers.google.com/maps/api-security-best-practices. Test quotas and map loads on-device.

## Release

Set a real HTTPS app origin in each private `.env.android.local`, then run `npm run android:rider -- --release` (and captain). This creates an unsigned release bundle for your signing process. Release builds reject loopback/HTTP endpoints and do not include the debug cleartext exception. Signing keys and Play Console publishing are separate setup steps; debug APKs are not production releases.

See [account roles](ACCOUNT-ROLES.md) for using Rider and Captain with the same account and the explicit online/offline transition.

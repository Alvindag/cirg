# DAS Orders (Android)

An offline order-taking app for field reps. It replaces paper order forms and the office re-typing of them.

- **No paper, no re-typing.** The rep picks the customer and products from a catalog stored on the phone. The order goes to the CRM by itself.
- **Fewer typing mistakes.** Quantities are whole numbers only (letters, decimals and minus signs are refused as they are typed). A quantity above 50 shows "100 × Amoxil 500mg. Is this right?" and must be confirmed by name before the order can be saved. The server refuses more than 1,000 of one product, and always prices the order from its own price list, never from the phone.
- **Works without a signal.** Orders are saved on the phone, and sent when there is a connection (on app start, when the signal returns, and every 30 seconds while something waits). Each order has an ID made on the phone, so a retry never creates a second order. An order the server refuses stays on the phone with the reason, until the rep deletes it.

It is a small web app (`www/`) in an Android shell ([Capacitor](https://capacitorjs.com)). The order rules are plain functions in `www/logic.js`, with tests in `test/`. The server side is in `lib/server/routes/core.ts` (`/orders/catalog`, `/orders`, `/orders/sync`, `/orders/mine`) and `lib/rtm/orders.ts`.

## Limits of this first version

- **Sign-in:** it works with the CRM's demo sign-in (the rep picks their name). It cannot sign in to a server that uses Microsoft sign-in yet; that needs a device sign-in step, which is not built.
- **Server address:** the phone must reach the CRM, for example `192.168.1.20:3000` for a PC on the same Wi-Fi, or a hosted address later. The app allows plain `http://`, which suits a local network and should be replaced by HTTPS when the CRM is hosted.
- **Orders are "Placed" only.** Confirming, delivering and cancelling happen outside this app for now. Placed orders count toward order totals, but have no delivery date, so they do not change OTIF until they are delivered.
- **Not built:** discounts or price edits on the phone, stock levels, order editing after saving, and an app icon of its own (it uses the default).
- The APK has been built nowhere yet. See below.

## Try it without a phone

```
# 1. start the CRM (in crm-dashboard/) with the demo sign-in
$env:ALLOW_DEMO_AUTH="true"; npm run build; npm run start:standalone     # PowerShell; or: npm run dev
# 2. in a second window, in crm-dashboard/mobile/
npm install
npm run serve
```

Open http://localhost:5090 and enter `localhost:3000`. A desktop browser blocks the cross-site calls unless started with web security off; the real app does not have this problem because it makes its calls natively. Simplest is to try it on the phone instead.

## Build the APK on Windows

You need once: [Node.js 20](https://nodejs.org), [Android Studio](https://developer.android.com/studio) (it brings JDK 17 and the Android SDK; in SDK Manager install "Android SDK Platform 34"), and Git.

```powershell
git clone https://github.com/Alvindag/cirg.git
cd cirg
git checkout claude/offline-order-app
cd crm-dashboard\mobile
npm install
npx cap sync android
cd android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

The APK is `crm-dashboard\mobile\android\app\build\outputs\apk\debug\app-debug.apk`. Copy it to the phone (USB, or share it to yourself), open it, and allow "install from this source" when Android asks. Or open the `android` folder in Android Studio and press Run with the phone plugged in (USB debugging on).

If Gradle says `SDK location not found`, create `android\local.properties` with the line `sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk`.

This is a **debug** build, fine for the pilot. A store release needs a signing key and a release build; that is not set up and nothing here publishes anywhere.

## Tests

```
npm test        # order rules (7 tests)
```

The server rules are in the CRM's tests (`npm test` in `crm-dashboard/`), and the phone flow (offline save, reconnect, no duplicates, typo guard) was run in a headless phone-size browser.

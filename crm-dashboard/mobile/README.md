# DAS Orders (Android)

An offline order-taking app for field reps. It replaces paper order forms and the office re-typing of them.

- **No paper, no re-typing.** The rep picks the customer and products from a catalog stored on the phone. The order goes to the CRM by itself.
- **Fewer typing mistakes.** Quantities are whole numbers only (letters, decimals and minus signs are refused as they are typed). A quantity above 50 shows "100 × Amoxil 500mg. Is this right?" and must be confirmed by name before the order can be saved. The server refuses more than 1,000 of one product, and always prices the order from its own price list, never from the phone.
- **Works without a signal.** Orders are saved on the phone, and sent when there is a connection (on app start, when the signal returns, and every 30 seconds while something waits). Each order has an ID made on the phone, so a retry never creates a second order. An order the server refuses stays on the phone with the reason, until the rep deletes it.

It is a small web app (`www/`) in an Android shell ([Capacitor](https://capacitorjs.com)). The order rules are plain functions in `www/logic.js`, with tests in `test/`. The server side is in `lib/server/routes/core.ts` (`/orders/catalog`, `/orders`, `/orders/sync`, `/orders/mine`) and `lib/rtm/orders.ts`.

## Limits of this first version

- **Sign-in:** it works with the CRM's demo sign-in (the rep picks their name). It cannot sign in to a server that uses Microsoft sign-in yet; that needs a device sign-in step, which is not built.
- **Server address:** the phone must reach the CRM, for example `192.168.1.20:3000` for a PC on the same Wi-Fi, or a hosted address later. The app allows plain `http://`, which suits a local network and should be replaced by HTTPS when the CRM is hosted.
- **Order lifecycle:** a rep can cancel their own order (with a reason) until a manager confirms it; managers confirm, record deliveries (including short deliveries) and cancel on the CRM's Orders page. Revenue is counted when the delivery is recorded. Delivery costs are not recorded for these orders, so cost to serve looks lower than it is for them.
- **Stock labels** (In stock / Low / Out) come from released warehouse batches. They are a hint, not a reservation, and an order can still be placed when it says Out.
- **Receipts** are plain text, shared through the phone's share sheet.
- **Not built:** customer signature and photos, credit limits, discounts needing approval, promotions, editing an order after saving (cancel and repeat instead), stock levels per distributor, and an app icon of its own (it uses the default).
- The debug APK has been built and run on one phone (same Wi-Fi as the CRM). A store release is not set up.

## Test it with your phone

1. On the PC, in `crm-dashboard`, run `npm install` and `npm run dev`. In development the CRM uses its demo sign-in and sample data, with no setup.
2. Find the PC's address on the Wi-Fi: run `ipconfig` and read "IPv4 Address" (for example `192.168.1.20`). The first time, Windows asks whether Node.js may use the network: allow it on **private** networks.
3. Put the phone on the same Wi-Fi. In the app, enter `192.168.1.20:3000` (your address), tap Connect, then pick a rep (for example "Kojo Asante").
4. Tap Start a new order. Turn on airplane mode to try it offline: orders are saved on the phone and sent when the signal returns. On the PC, open http://localhost:3000/orders to see them (switch the role at the top to a manager, e.g. Esi Mensah).

To try the app in a desktop browser instead: in `crm-dashboard/mobile` run `npm install` then `npm run serve`, and open http://localhost:5090. A browser blocks the calls to the CRM (different address), so the phone is the real test.

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
npm test        # order rules (9 tests)
```

The server rules are in the CRM's tests (`npm test` in `crm-dashboard/`), and the phone flow (offline save, reconnect, no duplicates, typo guard) was run in a headless phone-size browser.

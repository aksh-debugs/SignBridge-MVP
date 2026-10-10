# SignBridge MVP update

This update changes first-use setup, stores communication defaults in browser storage, adds text-to-speech and supported-browser speech recognition, optional external translation, local conversation history, editable Conversation Cards, camera gesture shortcuts, interpreter demo checkout, and an optional Firebase Realtime Database remote text-session integration.

## Apply update to the existing Vite project

1. Back up your current `src` folder or create a Git checkpoint first.
2. Extract the ZIP into the root of your existing `SignBridge-MVP` project and allow files in `src` to be replaced.
3. In a VS Code terminal at the project root, run:

   ```powershell
   npm.cmd install firebase @mediapipe/tasks-vision
   npm.cmd run build
   ```

4. If the build succeeds, run `npm.cmd run dev` and test each mode.

## Free-service notes

- Speech recognition uses the browser Web Speech API where supported. Recognition may send audio to a browser speech service, and support varies. It is not a guaranteed offline feature.
- Speech synthesis uses the browser/device voice.
- Translation sends only text that the user explicitly chooses to translate to the MyMemory public endpoint. The current implementation limits each request to 500 bytes. The anonymous allowance and terms can change; do not use this for sensitive medical, legal or private information. Original text remains visible for review.
- Gesture shortcuts use MediaPipe's general pretrained hand-gesture model. **This is not Indian Sign Language recognition or translation.** A validated ISL-trained model and evaluation set are still required for any ISL claim.
- Conversation history, Conversation Cards, and interpreter-demo records are stored locally in this browser and are not synced.
- Interpreter payment is entirely simulated. No real payment is collected, no payment credentials are requested, and no interpreter booking occurs. The price is an illustrative reference scenario based on the ASLI India 2025 tariff; it is not a live provider quote.
- Offline caching helps the app shell work after it has previously loaded online, but any live speech, translation or remote feature may still require the network.

## Configure remote sessions (Firebase Spark plan)

Remote messaging is genuine only after you configure Firebase. The app shows a setup warning until valid values exist. Use Firebase's no-cost Spark plan; do not enable pay-as-you-go or enter billing details.

1. In Firebase Console, create a project and add a Web app.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Create a **Realtime Database** in a suitable region.
4. Open Realtime Database → Rules and paste `firebase.database.rules.json`. Publish rules before using the demo.
5. Copy the Web app's `apiKey`, `authDomain`, `projectId`, `appId`, plus the Realtime Database URL.
6. In the project root, make a file named `.env.local` based on `.env.example` and fill in:

   ```ini
   VITE_FIREBASE_API_KEY=your-web-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://your-database-url
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_APP_ID=your-web-app-id
   ```

7. Restart the Vite server after changing `.env.local`.
8. Test in two browser profiles/devices: create a session in one and open the copied `?room=...` link in the other.

Room invitation links act as bearer invitations: share them only with intended participants. Current demo rooms expire after roughly three hours. These rules and flows are an MVP, not a security-reviewed production deployment. Do not put confidential or medical data in demo sessions.

## Features that are not claimed as complete

- Automatic speaker diarization is not integrated; group captions use a speaker label selected by the user.
- Full ISL recognition/translation is not integrated; the camera feature offers common-gesture phrase shortcuts only.
- Translation is a free third-party endpoint and may be inaccurate, unavailable or rate-limited.
- Interpreter booking and payment are simulation only.
- Remote sessions support text messaging, not a full voice/video call.

## Basic test sequence

1. Complete first-use setup and reload; settings should persist.
2. Test Visual, Type and Speak reply methods.
3. Use one-to-group large-message display and text-to-speech.
4. Use group-to-one microphone captions (grant permission); check fallback in unsupported browsers.
5. Translate a non-sensitive test phrase, review the output and keep the original visible.
6. Save a conversation, refresh, search, reopen, export and delete it.
7. Create and export a Conversation Card; confirm all content is user-entered.
8. Try Quick/Emergency phrases without translation.
9. Test the gesture mode with camera permission; verify results are phrase suggestions, not ISL translations.
10. Check interpreter fee arithmetic for before/after 6 PM; simulate success and failure; verify failed payment is not called confirmed.
11. Configure Firebase only if time allows; test remote messaging across two different browsers.
12. Run `npm.cmd run build` and fix all errors before pushing to GitHub.

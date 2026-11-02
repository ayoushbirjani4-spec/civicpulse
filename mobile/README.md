# CivicPulse mobile app

React Native with Expo. Module 1 adds Register, Verify code, Login and Profile. Module 2
adds My Reports and New Report: in-app camera, category picker, GPS position with its
accuracy and mock-location flag, and an offline queue that uploads when signal returns.

## Run it on your phone

1. Start the API from the repository root with `docker compose up`.
2. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_URL` to your computer's Wi-Fi
   address. Find it with `ipconfig`. A phone cannot reach `localhost` on your computer.
   Git ignores `.env.local`, so each member's address stays on their own machine.
3. Install the packages and start Expo:

```bash
npm install
```

```bash
npx expo start
```

4. Scan the QR code with the Expo Go app. The phone and computer must be on the same
   Wi-Fi, and Windows Firewall must allow port 8000.

In development, verification codes arrive at http://localhost:8025.

Check the code before opening a pull request:

```bash
npx tsc --noEmit
```

## Good to know

- Tokens and the cached profile are kept in Expo SecureStore. A saved session survives an
  app restart and works with no signal. Only a refresh token the server rejects logs the
  user out.
- Reports are saved in SQLite with their photo in the app's document folder, and leave the
  phone only after the server confirms them. Retries back off from 30 seconds to 30
  minutes. A rejected report (for example, an unreadable photo) stays listed so you can
  discard it.
- Location is requested only while the app is open.
- If Metro crashes on a low-memory computer, start it with `npx expo start --max-workers 1`.
- `push_token` is sent as `null` for now. Module 7 fills it in, using an EAS development
  build.

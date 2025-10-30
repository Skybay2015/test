# README — Architecture, library choices, compromises and scaling for production

## Project Overview

The project is an Expo (managed) React Native application:

- `expo` v54, `react` 19.1, `react-native` 0.81.5.
- Source structure: `src/components`, `src/screens`, `src/navigation`, `src/services`, `src/stores`, `src/utils`, `src/types`.
- State management: `zustand` (lightweight storage).
- HTTP: `axios`.
- Storage/security: `expo-secure-store`, also uses `expo-crypto`, `expo-random`.
- Media: `expo-av`.
- Navigation: `@react-navigation/native` + `native-stack`.
- Async storage: `@react-native-async-storage/async-storage`.

The project is organized in a familiar layered architecture for mobile applications: UI (components/screens) → navigation → services (API connection) → store (zustand) → utils.

---

## Architectural decisions and motivations

1. **Expo (managed workflow)**

   - Pros: fast development, convenient set of modules (secure store, crypto, av, etc.), easy `expo start` launch.
   - Cons: some native modules and custom native code require transition to bare / prebuild, OTA requires `expo-updates`/EAS.

2. **`services` layer (API abstraction)**

   - All network calls are encapsulated in `src/services` (`api.ts`, `AuthService`, `AlertsService`, etc.). This provides a centralized point for axios configuration (baseURL, interceptors, retry, etc.), mocking in tests, and implementation replacement (e.g., transition to GraphQL).

3. **Zustand for state management**

   - Pros: simplicity, low boilerplate, minimal code for local and global state.
   - Limitations: as the application grows and complex relationships between modules emerge, a more formalized solution may be needed (Redux Toolkit / RTK Query / MobX).

4. **Components / screens**

   - Clear separation of UI components and screens — facilitates testing and reusability.

5. **Token security**
   - Tokens are stored in `expo-secure-store` — a reasonable choice for mobile secret storage in managed Expo.

---

## Used libraries (main)

- expo (managed)
- react, react-native
- @react-navigation/native, @react-navigation/native-stack — navigation
- axios — HTTP
- zustand — state management
- expo-secure-store — secure token storage
- expo-crypto, expo-random — crypto functions
- expo-av — video/audio playback
- @react-native-async-storage/async-storage — cache/local storage (used for caching in the project)
- crypto-js — symmetric encryption/hashes

---

## Main compromises and when to reconsider them

1. **Zustand vs Redux**

   - For small/medium applications `zustand` is a fast and lightweight option. If the project becomes large (many state derivations, complex async flows, need for time-travel debugging, complex devtools) — consider Redux Toolkit + RTK Query.

2. **Expo-managed vs Bare**

   - Managed speeds up development. But if a lot of native logic is needed (e.g., custom SDKs, detailed native analytics, complex background processing) — transition to bare (or `expo prebuild`) is inevitable. Plan ahead: keep code loosely-coupled to simplify prebuild.

3. **Axios**

   - Axios is convenient and familiar; for complex caching/invalidations consider RTK Query (especially if you add Redux) or implement an HTTP client layer with retry/backoff.

4. **OTA (Over The Air updates)**
   - The project doesn't have an explicit `expo-updates` dependency. For OTA updates, I recommend integrating `expo-updates` + considering EAS Updates. Remember: OTA covers JS/bundle and assets, but doesn't work for native code changes — those require a new build in App Store / Play Store.

---

## Production readiness / scaling recommendations

### 1) Refactoring / modularity

- Break down `src` into feature modules (e.g., `features/alerts`, `features/auth`), where each module contains `components`, `screens`, `services`, `store`.
- Introduce API layer contracts (types / interfaces) and response typing (TypeScript interfaces).

### 2) Network reliability and caching

- Add global axios-interceptors for error handling and refresh token flow.
- Use caching (possibly with `react-query` or RTK Query) for data frequently used on screen (catch stale-while-revalidate).
- Response schema validation (zod / io-ts) for early detection of API changes.

### 3) Monitoring and analytics

- Connect Sentry (crash reporting) and/or Firebase Crashlytics.
- Logs (e.g., LogRocket Mobile, Amplitude) for user behavior analytics.

### 4) Security

- Never store secrets directly in repo. Use environment variables + EAS secrets / CI secrets.
- Protect tokens: `expo-secure-store`.
- Conduct dependency audits (npm audit / Snyk).

### 5) Tests

- Unit: Jest + ts-jest for services and utils.
- Integration/Component: React Native Testing Library.
- E2E: Detox or Appium (especially if using bare workflow).

---

## OTA (Over-the-air) — how to set up

1. Install and configure `expo-updates` (or EAS Updates):
   - `expo install expo-updates`
   - Configure `app.json` / `app.config.js` (`updates`, `runtimeVersion` keys).
   - In `expo-updates` specify `runtimeVersion` to control which bundle is compatible with which native build.
2. EAS (Expo Application Services):
   - Switch to EAS Build / EAS Update for production workflows.
   - EAS provides release channel management and staged rollout capabilities.
3. Limitations:
   - Any native module changes require a new native build — OTA won't help.
   - OTA should not be used for sensitive data migrations requiring native DB schema changes.

---

## CI/CD — example flow and recommendations

Goal: automatic lint/typecheck → tests → build → deploy (EAS/Fastlane) → release channel / store.

Example pipeline (GitHub Actions):

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --coverage
  build_eas:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npm i -g eas-cli
      - run: eas build --non-interactive --platform all --profile production
        env:
          EAS_PRIVATE_KEY: ${{ secrets.EAS_PRIVATE_KEY }}
```

---

## Specific steps for this repository (recommended to implement)

1. Add `expo-updates` and configure `app.json` (`runtimeVersion`) → for OTA.
2. Add `eas.json` and connect EAS (build/profiles).
3. Set up GitHub Actions (CI) with linting, tests, and `eas build`/`eas update` steps.
4. Add Sentry/Crashlytics integration and automatic sourcemaps/dSYMs upload.
5. Move `baseURL` and secrets to env via EAS secrets (don't store in code).
6. Add unit tests (Jest) and basic E2E (Detox for native/AAB workflow) — integrate into CI.
7. As it grows — consider migrating some global state to Redux Toolkit + RTK Query for powerful caching and automatic refetching.

---

## Brief summary — pros of current approach

- Fast development thanks to Expo.
- Clean, understandable structure: services / stores / components / screens.
- Lightweight state management (zustand) — quick to start.
- Ready foundation for adding OTA (expo-updates) and CI (EAS + GitHub Actions).

## Risks / what needs to be done before production

- Set up OTA (expo-updates/EAS).
- Full CI with tests + builds.
- Monitoring and crash reporting.
- Secret management + code signing.
- Migration plan if native code is needed — plan prebuild/transition.

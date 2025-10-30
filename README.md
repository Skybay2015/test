# README — Архитектура, выбор библиотек, компромиссы и масштабирование для продакшена

## Краткая картина проекта

Проект — Expo (managed) React Native приложение:

- `expo` v54, `react` 19.1, `react-native` 0.81.5.
- Структура исходников: `src/components`, `src/screens`, `src/navigation`, `src/services`, `src/stores`, `src/utils`, `src/types`.
- Состояние: `zustand` (легкий сторадж).
- HTTP: `axios`.
- Хранилища/безопасность: `expo-secure-store`, также используется `expo-crypto`, `expo-random`.
- Медиа: `expo-av`.
- Навигация: `@react-navigation/native` + `native-stack`.
- Async storage: `@react-native-async-storage/async-storage`.

Проект организован в привычной для мобильных приложений layered-архитектуре: UI (components/screens) → navigation → services (связь с API) → store (zustand) → utils.

---

## Архитектурные решения и мотивы

1. **Expo (managed workflow)**

   - Плюсы: быстрая разработка, удобный набор модулей (secure store, crypto, av и т.д.), лёгкий запуск `expo start`.
   - Минусы: некоторые нативные модули и custom native code требуют перехода в bare / prebuild, OTA требует `expo-updates`/EAS.

2. **Слой `services` (API abstraction)**

   - Все сетевые вызовы инкапсулированы в `src/services` (`api.ts`, `AuthService`, `AlertsService` и т.д.). Это даёт централизованную точку для настройки axios (baseURL, interceptors, retry и пр.), мокирования в тестах и замены реализации (например, переход на GraphQL).

3. **Zustand для state management**

   - Плюсы: простота, низкая шаблонность, малый объём кода для локального и глобального состояния.
   - Ограничения: при увеличении приложения и сложных связях между модулями может потребоваться более формализованное решение (Redux Toolkit / RTK Query / MobX).

4. **Компоненты / screens**

   - Чёткое разделение UI-компонентов и экранов — облегчает тестирование и переиспользование.

5. **Безопасность токенов**
   - Токены хранятся в `expo-secure-store` — разумный выбор для мобильного хранилища секретов в managed Expo.

---

## Используемые библиотеки (основные)

- expo (managed)
- react, react-native
- @react-navigation/native, @react-navigation/native-stack — навигация
- axios — HTTP
- zustand — state management
- expo-secure-store — безопасное хранение токенов
- expo-crypto, expo-random — криптофункции
- expo-av — воспроизведение видео/аудио
- @react-native-async-storage/async-storage — кэш/локальное хранилище (в проекте используется для кэша)
- crypto-js — симметричное шифрование/хеши

---

## Главные компромиссы и когда их пересмотреть

1. **Zustand vs Redux**

   - Для маленького/среднего приложения `zustand` — быстрый и легковесный вариант. Если проект станет большим (много дериваций состояния, сложные async flows, need for time-travel debugging, сложные devtools) — стоит рассмотреть Redux Toolkit + RTK Query.

2. **Expo-managed vs Bare**

   - Managed ускоряет разработку. Но если потребуется много нативной логики (например собственные SDK, детальные native-аналитики, сложный background processing) — переход в bare (или `expo prebuild`) неизбежен. Планируйте заранее: держите код loosely-coupled, чтобы упростить prebuild.

3. **Axios**

   - Axios удобен и familiar; для сложного кэширования/invalidations стоит посмотреть RTK Query (особенно если добавите Redux) либо внедрить слой HTTP-клиента с retry/backoff.

4. **OTA (Over The Air updates)**
   - В проекте нет явной зависимости `expo-updates`. Для OTA-обновлений рекомендую интегрировать `expo-updates` + рассмотреть EAS Updates. Помните: OTA покрывает JS/bundle и ассеты, но не работает для изменений нативного кода — для них нужен новый билд в App Store / Play Store.

---

## Рекомендации по подготовке к продакшену / масштабированию

### 1) Рефакторинг / модульность

- Разбить `src` на feature-модули (например `features/alerts`, `features/auth`), где внутри каждого модуля есть `components`, `screens`, `services`, `store`.
- Ввести контракт для API-слоя (types / interfaces) и типизацию ответов (TypeScript interfaces).

### 2) Надёжность сети и кэширование

- Добавить глобальные axios-interceptors для обработки ошибок и refresh token flow.
- Использовать кэш (возможно с `react-query` или RTK Query) для данных, часто используемых на экране (ловить stale-while-revalidate).
- Валидация схем ответов (zod / io-ts) для раннего обнаружения изменений API.

### 3) Мониторинг и аналитика

- Подключить Sentry (crash reporting) и/или Firebase Crashlytics.
- Логи (например LogRocket Mobile, Amplitude) для аналитики поведения пользователей.

### 4) Безопасность

- Never store secrets directly in repo. Используйте environment variables + EAS secrets / CI secrets.
- Защищать токены: `expo-secure-store`.
- Проводить аудит зависимости (npm audit / Snyk).

### 5) Тесты

- Unit: Jest + ts-jest для services и utils.
- Integration/Component: React Native Testing Library.
- E2E: Detox или Appium (особенно если используете bare workflow).

---

## OTA (Over-the-air) — как настроить

1. Установить и настроить `expo-updates` (или EAS Updates):
   - `expo install expo-updates`
   - Настроить `app.json` / `app.config.js` (ключи `updates`, `runtimeVersion`).
   - В `expo-updates` указывать `runtimeVersion` для контроля какой бандл совместим с каким нативным билдом.
2. EAS (Expo Application Services):
   - Перейти на EAS Build / EAS Update для production workflows.
   - EAS даёт управление каналами/релизами (release channels / update channels) и возможность staged rollouts.
3. Ограничения:
   - Любые изменения нативных модулей требуют новый нативный билд — OTA не поможет.
   - OTA не должен использоваться для sensitive data migrations, где требуется изменение схемы native DB.

---

## CI/CD — примерной поток и рекомендации

Цель: автоматический линт/типчек → тесты → билд → deploy (EAS/Fastlane) → release channel / store.

Пример pipeline (GitHub Actions):

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

## Конкретные шаги для этого репозитория (рекомендую реализовать)

1. Добавить `expo-updates` и настроить `app.json` (`runtimeVersion`) → для OTA.
2. Добавить `eas.json` и подключить EAS (build/profiles).
3. Настроить GitHub Actions (CI) с линтингом, тестами, и шагами `eas build`/`eas update`.
4. Добавить Sentry/Crashlytics интеграцию и автоматическую отправку sourcemaps/dSYMs.
5. Вынести `baseURL` и секреты в env через EAS secrets (не хранить в коде).
6. Добавить unit-тесты (Jest) и базовый E2E (Detox для native/AAB workflow) — интегрировать в CI.
7. По мере роста — рассмотреть миграцию некоторого глобального стейта на Redux Toolkit + RTK Query для мощного кэширования и автоматического рефетчинга.

---

## Краткое резюме — плюсы текущего подхода

- Быстрая разработка благодаря Expo.
- Чистая, понятная структура: services / stores / components / screens.
- Легковесный state management (zustand) — быстро стартовать.
- Готовая база для добавления OTA (expo-updates) и CI (EAS + GitHub Actions).

## Риски / что нужно доделать перед продом

- Настроить OTA (expo-updates/EAS).
- Полноценный CI с тестами + сборками.
- Мониторинг и crash reporting.
- Управление секретами + code signing.
- План миграции, если потребуется нативный код — спланируйте prebuild/transition.

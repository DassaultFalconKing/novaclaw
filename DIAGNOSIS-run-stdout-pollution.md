# Diagnosis — P3 `novaclaw run` child stdout polluted by Effect INFO logs

**Status:** STOPPED (handoff) — root cause полностью подтверждён, план фикса выбран, реализация не начата.
**Start:** 2026-08-02 · package: `packages/novaclaw` / `packages/core` / `effect@4.0.0-beta.83`
**Last action:** проверена точка встройки фикса (in-fiber prebuild в `run.ts`); остались 2 мелкие проверки (см. «Открытые вопросы»).

---

## 1. Симптом

P3-сьют `packages/novaclaw/test/cli/run/run-process.test.ts` (happy-path) спавнит дочерний процесс
`novaclaw run "..."` и парсит его stdout как JSON-строки. До первой JSON-строки в stdout попадают
Effect-логи уровня INFO:

```
INFO  seeded recipes ...
INFO  messenger gateway starting ...
```

→ `JSON.parse` первой строки падает → тест красный. (Изначально выводились также логи из
fork'а календаря — их отключили раньше; в текущем репро остались два источника ниже.)

## 2. Воспроизведение

- `/tmp/opencode/repro.mjs` — спавнит CLI (`bun run --conditions=browser src/index.ts run "<msg>" --dir <home>`),
  собирает stdout/stderr (и trace через `NOVACLAW_RUN_TRACE`, см. `run.ts:25`).
- `/tmp/opencode/repro-home` — фикстура-«дом» проекта для репро.

## 3. Источники мусорных строк (подтверждены файловым логом)

1. `packages/novaclaw/src/server/routes/instance/httpapi/server.ts:315-320` — `recipeSeedStartup` → «seeded recipes».
2. `packages/core/src/messenger/gateway.ts:952` — «messenger gateway starting» (и fork календаря).

## 4. Корневая причина (механизм полностью проверен по исходникам Effect)

1. **Дефолтный логгер Effect** pretty-print'ит через `console.log` → stdout.
2. `Observability.layer` (`packages/core/src/observability.ts:25-40`) делает
   `Logger.layer([...Logging.loggers()], { mergeWithExisting: false })`; при пустом
   `CurrentLoggers` побеждает **дефолтный логгер** (`dist/Logger.js:946`).
3. `HttpRouter.toWebHandler` (`dist/unstable/http/HttpRouter.js:646-658`) =
   `HttpEffect.toWebHandlerLayerWith(Layer.provideMerge(appLayer, RouterLayer), { toHandler, middleware, memoMap })`.
4. `toWebHandlerLayerWith` (`dist/unstable/http/HttpEffect.js:201-220`) **строит слой один раз через
   `Effect.runPromise`** — это «голое» волокно с пустыми FiberRefs → любой `Effect.logInfo` во время
   билда идёт дефолтным логгером → stdout.
5. In-process путь: `packages/novaclaw/src/cli/cmd/run.ts:871-884` `fetchFn` →
   `Server.Default().app.fetch(...)`; `webHandler` — это `lazy(...)` (httpapi/server.ts:385-393), билд
   происходит **при первом запросе**, из обычной async-функции — ни волокна Effect, ни логгеров.
6. `runForkWith`/`runPromiseExitWith` (`dist/internal/effect.js:2125-2182`) создают голый `FiberImpl`
   напрямую — **глобального runtime'а для «посева» логгеров не существует**; фикс обязан быть на
   уровне билда слоя или на самих log-сайтах.
7. `MemoMapImpl` (`dist/Layer.js:147-170`) мемоизация по identity; `fromBuildMemo` (122-125) —
   если пред-собрать тот же инстанс слоя в общий `memoMap` (модуль `@novaclaw/core/effect/memo-map`),
   последующий голый билд попадёт в мемо.

### Отвергнутые варианты

- **Глобальный редирект console.log → stderr:** не годится — `console.log` легитимно пишет в stdout
  в `agent.ts:223`, `session.ts:119/128`, `serve.ts:61/70/108/112`, `db.ts:29` (одноразовый вывод CLI).
  Прецедент `globalThis.AI_SDK_LOG_WARNINGS = false` (`server.ts:12`) тут неприменим.
- **Посев глобальных FiberRefs/runtime:** невозможен (голый `FiberImpl` из `runForkWith`).

### Факты об окружении теста

- Харнесс (`test/lib/cli-process.ts`): `extendEnv: true`, stdin ignore, сбор stdout/stderr, `rimraf`-очистка.
- `NOVACLAW_PRINT_LOGS` в ребёнке не задан → активен только файловый логгер (`fileLogger`, порог `minimumLogLevel`).
- `novaclaw.log` содержит bootstrap-строки, но **не** мусорные INFO (они уходят в stdout через дефолтный логгер).
- Общий фейковый LLM-сервер: `test/lib/llm-server.ts` (роуты ~702-703) — используется всеми тестами сьюта.

## 5. Кандидаты на фикс

- **C1 (фаворит)** — на сайте билда `webHandler` обернуть `routes` так, чтобы голое волокно билда
  писало через `CurrentLoggers`: `Layer.provide(routes, Logger.layer(Logging.loggers(), { mergeWithExisting: false })
  .pipe(Layer.provide(NodeFileSystem.layer)))` (+ `OtlpSerialization.layerJson`/`FetchHttpClient.layer`, если
  используются OTLP-логгеры). HTTP-запросный логгер не трогаем — уже `disableLogger: true`.
- **C2** — пред-прогрев слоя в общий `memoMap` под нормальным runtime до первого fetch.
  Блокер: `Layer.provideMerge` создаёт новый объект-обёртку на каждый вызов `toWebHandler` → мемо-промах.
- **C3 (fallback)** — переписать два мусорных log-сайта на прямые вызовы через `Logging`-хелперы
  (паттерн `logger.log(options)` из `stderrLogger`, `packages/core/src/observability/logging.ts`).

## 6. Выбранное направление (in-fiber prebuild) — проверенные детали

- Хендлер `run.ts` — это Effect: `handler: Effect.fn("Cli.run")(function* (args) { ... })` (строка 245),
  всё тело — внутри `yield* Effect.promise(async () => {...})` (строка 253) — дочернее волокно,
  **наследует FiberRefs** (логгеры Observability на месте). НО: обычный `await`/`Effect.runPromise`,
  вызванный из этого async-тела, НЕ наследует `CurrentLoggers` (новое голое корневое волокно).
  → prebuild должен быть **`yield*` прямо в генераторе** (до `yield* Effect.promise(...)`), не внутри async-тела.
- `HttpRouter.layer` экспортируется (`Layer.effect(HttpRouter)(make)`, HttpRouter.js:355) — это и есть
  `RouterLayer` из `toWebHandler`.
- `toWebHandlerWith(context)(self, middleware)` (HttpEffect.js:160-170) возвращает
  `(request, reqContext) => Promise<Response>` — совпадает с сигнатурой `Server.Default`'s
  `handler(request, HttpApiApp.context)`.
- Хендлер-эффект: `Context.get(context, HttpRouter).asHttpEffect()`.

**Дизайн:** в `httpapi/server.ts` модульный кэш + экспорт:

```ts
let prebuilt: { handler: ..., dispose: () => ... } | undefined

export const buildWebHandler = Effect.gen(function* () {
  const scope = Scope.makeUnsafe()
  const fullLayer = Layer.provideMerge(routes, HttpRouter.layer)
  const context = yield* Layer.buildWithMemoMap(fullLayer, memoMap, scope)
  const handler = toWebHandlerWith(context)(
    yield* Effect.succeed(Context.get(context, HttpRouter).asHttpEffect()),
    disposeMiddleware,
  )
  prebuilt = { handler, dispose: () => Effect.runPromise(Scope.close(scope, Exit.void)) }
  return prebuilt
})

export const webHandler = lazy(() => prebuilt ?? HttpRouter.toWebHandler(routes, { disableLogger: true, memoMap, middleware: disposeMiddleware }))
```

В `run.ts` (не-attach путь): динамический импорт `HttpApiApp` + `yield* HttpApiApp.buildWebHandler()`
до `yield* Effect.promise(...)` (run.ts:253). Кэш покрывает и плагинный fetch-fallback
(`packages/novaclaw/src/plugin/index.ts`, `n.app.fetch`). Fallback в `webHandler` сохраняет текущее
поведение `serve`/тестов без изменений.

## 7. Где остановился — открытые вопросы

1. Уточнить import-спецификатор для `httpapi/server.ts` из `server/server.ts` (алиас пути), чтобы
   переиспользовать в динамическом импорте `run.ts`.
2. Проверить, что `toWebHandlerWith` экспортируется из индекса `effect/unstable/http`.
3. Реализовать `buildWebHandler` + вызов prebuild в `run.ts`; прогнать `/tmp/opencode/repro.mjs`,
   затем happy-path тест P3.
4. Прогнать весь `run-process.test.ts` — есть параллельный таймаут всего файла ~30.7s (одиночный
   тест ~3.9s); подозрение на общий `TestLLMServer`/порт между тестами. (Задача №2.)
5. Если prebuild не сработает → C3 (переписать два log-сайта).
6. Независимо: P2 — форма конфига для `mcp add` (отложенная задача, контекст не потерян в specs/v2).

## 8. Связанные файлы

- `packages/novaclaw/src/server/routes/instance/httpapi/server.ts` — сайт `webHandler` (385-393), `recipeSeedStartup` (315-320), общий `memoMap` (115).
- `packages/core/src/observability/logging.ts` — `fileLogger` (эффектный, требует FS), паттерн `stderrLogger`, `formatter`; `packages/core/src/observability.ts` — `layer` (25-40).
- `packages/core/src/messenger/gateway.ts:952` — «messenger gateway starting».
- `packages/novaclaw/src/server/server.ts` — ленивый `Default` (57-66), `AI_SDK_LOG_WARNINGS` (12).
- `packages/novaclaw/src/cli/cmd/run.ts` — `emit` (572-582, пишет JSON через `process.stdout.write` — не затронут), `fetchFn` (871-884), хендлер `Effect.fn` (245), `Effect.promise` (253).
- `packages/novaclaw/src/plugin/index.ts` — fetch-fallback плагинов (`n.app.fetch`).
- Интреналы Effect: `dist/unstable/http/HttpRouter.js` (toWebHandler 646-658, layer 355), `dist/unstable/http/HttpEffect.js` (toWebHandlerWith 160, toWebHandler 194, toWebHandlerLayerWith 201-220), `dist/internal/effect.js` (runForkWith 2125, runPromiseExitWith 2176), `dist/Logger.js` (layer 946, toFile 1051), `dist/Layer.js` (fromBuildMemo 122, MemoMapImpl 147).
- `packages/novaclaw/src/effect/app-runtime.ts` (Observability merge 79); `packages/novaclaw/src/cli/effect-cmd.ts`.
- `packages/novaclaw/test/lib/cli-process.ts`, `test/lib/llm-server.ts`, `test/cli/run/run-process.test.ts`; `/tmp/opencode/repro.mjs` + `/tmp/opencode/repro-home`.

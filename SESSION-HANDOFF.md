# NovaClaw — приёмка работы от предыдущих сессий (патчеров)

Ты продолжаешь работу в репозитории /home/jinx/Disk2/novaclaw. Сначала прочитай
AGENTS.md (обязателен: конвенции, стиль, как гонять тесты/типы) и два диагностических
документа — они главный источник состояния:
- DIAGNOSIS-run-stdout-pollution.md  — статус: STOPPED, рут-коза подтверждена, направление фикса выбрано
- DIAGNOSIS-reference-permission.md  — статус: IN PROGRESS, рут-коза НЕ подтверждена

Эти доки закоммичены на ветке diagnosis-notes (PR #3, только доки — можно не мержить).
Ветка по умолчанию — main. Новая работа: отдельная ветка (имя ≤3 слова через дефис,
без слешей/префиксов типов), conventional-коммиты.

## Задача 1 (главная): P3 stdout-поллюция — ДОВЕСТИ ФИКС ДО КОНЦА

Симптом: дочерний процесс `novaclaw run` в test/cli/run/run-process.test.ts пишет
Effect INFO-строки ("seeded recipes", "messenger gateway starting") в stdout до первой
JSON-строки → JSON.parse падает.

Рут-коза (проверена): HttpRouter.toWebHandler строит слой ОДИН раз через Effect.runPromise
(голое волокно, пустой CurrentLoggers → дефолтный логгер → console.log → stdout);
в run.ts fetchFn (строки 871-884) триггерит ленивый webHandler (httpapi/server.ts:385-393)
из обычной async-функции при первом запросе. Глобального runtime для «посева» логгеров
нет (runForkWith создаёт голый FiberImpl), глобальный редирект console.log невозможен
(легитимный вывод CLI в agent.ts:223, session.ts:119/128, serve.ts, db.ts:29).
Мусорные сайты: httpapi/server.ts:315-320 (recipeSeedStartup), core/src/messenger/gateway.ts:952.

Выбранное направление — in-fiber prebuild (всё в доке, раздел 6):
1. В httpapi/server.ts: модульный кэш + `export const buildWebHandler` (Effect):
   Scope.makeUnsafe() + Layer.buildWithMemoMap(Layer.provideMerge(routes, HttpRouter.layer),
   memoMap, scope) + toWebHandlerWith(context)(Context.get(context, HttpRouter).asHttpEffect(),
   disposeMiddleware); кэшировать { handler, dispose }. webHandler = lazy(() => prebuilt ??
   HttpRouter.toWebHandler(routes, { disableLogger: true, memoMap, middleware: disposeMiddleware })).
2. В run.ts (не-attach путь): динамический импорт HttpApiApp + `yield* HttpApiApp.buildWebHandler()`
   ДО `yield* Effect.promise(...)` (строка 253) — прямо в генераторе (строка 245), не внутри
   async-тела (там Effect.runPromise даст голое волокно без логгеров).
3. Кэш автоматически покроет плагинный fetch-fallback (plugin/index.ts).

Проверки перед реализацией: (а) import-спецификатор httpapi/server.ts из server/server.ts;
(б) экспортируется ли toWebHandlerWith из индекса "effect/unstable/http".
Fallback (если prebuild не сработает): переписать два log-сайта на прямые вызовы через
Logging-хелперы (паттерн logger.log(options) из stderrLogger в core/src/observability/logging.ts).

Верификация: /tmp/opencode/repro.mjs (+ /tmp/opencode/repro-home) — stdout ребёнка должен
стать чистым JSON; затем happy-path тест из run-process.test.ts. Отладка через NOVACLAW_RUN_TRACE.
Окружение: Bun 1.3.14, effect 4.0.0-beta.83; тесты — из packages/novaclaw
(`bun test test/cli/run/run-process.test.ts`), НЕ из корня; typecheck — `bun typecheck` из пакета.

## Задача 2: таймаут всего run-process.test.ts (~30.7s при одиночном тесте ~3.9s)

Подозрение: общий TestLLMServer/порт (test/lib/llm-server.ts, роуты ~702-703) между тестами.
Разобраться и починить.

## Задача 3: DIAGNOSIS-reference-permission.md — продолжить расследование

"project reference directories are allowed for external_directory" всегда падает: Permission.evaluate
возвращает deny, whitelist из references пуст. Контекст: Config→SQLite, references переехали в
ReferenceConfigStore (инстансовый сид). См. док + probe2.test.ts (test/agent/probe2.test.ts).
Изоляция-паттерн: test/config/config.test.ts:206-255; подозрение на утечку фикстуры из
test/permission-task.test.ts:145-200. ПОСЛЕ завершения: закрыть статус в доке.

## Отложенное (не трогать без необходимости)

- P2: форма конфига для `mcp add` (контекст в specs/v2).

## Порядок работы

1. Прочитай AGENTS.md + оба DIAGNOSIS-дока.
2. Задача 1: две проверки импортов → реализация → repro → тест P3 → весь файл (задача 2).
3. Если всё зелёное — коммит (conventional: `fix(novaclaw): ...`), пуш, PR в main.

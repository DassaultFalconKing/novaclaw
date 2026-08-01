# NovaClaw: integrations, streaming и восстановление агента

Дата проверки: 2026-08-01  
Ветка: `agent-integrations-fix`  
База: `9072b89` (`build-linux-V3`)

## Результат

Локальный отчёт агента подтверждён по сохранённой сессии, SQLite и журналам desktop-приложения. Исправлены двенадцать связанных пользовательских симптомов, reliability-разрывов и интеграционных рисков:

1. В Settings добавлен раздел **Integrations** для постоянной настройки MCP-серверов.
2. Там же добавлено подключение и отключение источников skills (локальный путь или URL).
3. Безопасно восстанавливается один оборванный provider stream после уже показанного текста.
4. Устранён переход маршрута, который мог оставлять одновременно два `PromptInput` одной сессии.
5. В Linux/Windows удаляется неиспользуемое нативное меню Electron, перехватывавшее Alt при Alt+Shift.
6. Provider dispatch журналируется до сетевого вызова; незакрытая попытка после process loss видна в Session и требует явного продолжения пользователя.
7. Длинный text/reasoning/tool-input stream получает ограниченные durable checkpoints, поэтому SSE reconnect перечитывает не только начало сообщения.
8. В **Settings → Recovery** добавлен опциональный provider watchdog с отдельными inactivity/absolute лимитами и видимым retry status.
9. Добавлены runtime guard caps для tool calls за turn/drain, durable inbox backlog и объёма provider stream; срабатывание переводит Session в видимый `paused`, не повторяя tools.
10. Фоновый `/sub-agent` переведён на единый durable child-Session lifecycle: admission → wake → self-drive → `exit(result)` → event-driven `wait` и live completion projection.
11. Закрыты утечки MCP secrets через config/export/logs, заработал startup timeout и connect endpoint теперь подтверждает фактическое состояние, а не только отсутствие исключения.
12. **Add Model** больше не блокируется ожидающим backend: диалог монтируется до загрузки presets, а presets/probe ограничены клиентскими дедлайнами 5/7 секунд.

## Локализация исходного отчёта

Найдена сессия `ses_04251f474ffeCruQO5vOW2x4BV` (`PII_PARSER directory analysis`) в локальной БД `~/.local/share/novaclaw/novaclaw.db`.

- В событиях 317 и 328 пользователь прямо сообщает об отвалившемся стриме и просит «антиотвал стрима».
- В событиях 405 и 512 пользователь просит найти MCP/skills и место подключения MCP.
- Последний ответ агента заканчивается посреди исследования после текста о поиске MCP-конфига, с незавершённым bash tool-call.
- В `renderer.log` текущего запуска многократно зафиксировано: `2 PromptInput instances live` для этой же сессии; рядом присутствует блокировка autofocus.
- В `server.log` многократно зафиксировано: `ProviderShared.stream: Failed to read nancy/openai-compatible-chat stream`.
- Таблица `skill_config` заполнена, а локальные skills реально присутствуют в `~/.local/share/novaclaw/skills`: backend skills работал, отсутствовала управляющая поверхность в UI.
- Отдельные сообщения `failed to subscribe` относятся к list subscriptions File/Provider HttpApi. Они не являются причиной обрыва provider stream и не использовались как доказательство этой ошибки.

## Причины и исправления

| Симптом                     | Причина                                                                                                                                                         | Ответственный код                                                                                                            | Исправление                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Нет подключения MCP»       | Backend, HTTP routes и переключатель уже существовали, но UI позволял только включать заранее сконфигурированные серверы                                        | `packages/core/src/config/mcp.ts`, `packages/novaclaw/src/mcp/index.ts`, `packages/app/src/components/dialog-select-mcp.tsx` | Новый persistent editor local-command/remote-HTTP MCP в `settings-v2/integrations.tsx`; argv локальной команды принимается как JSON-массив, без неявного shell parsing                           |
| «Нет опции skills»          | `SkillConfigStore` и discovery существуют, но `skills: string[]` не были выведены в Settings                                                                    | `packages/core/src/skill-config-store.ts`, `packages/core/src/skill-config-seed.ts`                                          | Добавление/удаление источников skills через существующий `updateConfig`; массив записывается целиком согласно контракту ConfigStoreWrite                                                         |
| Перерывы streaming          | При transient transport error после первых text/reasoning events runner сохранял partial assistant, но завершал drain ошибкой                                   | `packages/core/src/session/runner/llm.ts`                                                                                    | Один durable steer просит продолжить ровно от обрыва; повторный обрыв останавливается с synthetic warning. После любого tool protocol автоматического replay нет, чтобы не повторить side effect |
| Обрывы chat UI              | `resolved()` внутри route memo переводил shell в Suspense. Keyed transition мог удержать старое дерево и смонтировать новое, оставляя два composer одной сессии | `packages/app/src/app.tsx`                                                                                                   | Переход использует non-suspending `resolved.latest`, поэтому старый route сразу dispose-ится и остаётся один URL-owned session view                                                              |
| Потеря фокуса при Alt+Shift | На Linux оставалось дефолтное меню Electron; bare Alt в языковом chord мог активировать меню и вывести фокус из composer                                        | `packages/desktop/src/main/menu.ts`                                                                                          | Для Linux/Windows вызывается `Menu.setApplicationMenu(null)`; macOS menu остаётся без изменений                                                                                                  |
| Рестарт во время provider turn | До физического provider call не было durable dispatch marker; после SIGKILL нельзя отличить безопасный retry от попытки с неизвестным результатом | `packages/core/src/session/runner/llm.ts`, Session schema/projector/SQL | Durable `ProviderAttempt.Started/Settled/Abandoned`, nullable `provider_recovery`, migration и recovery dock; новая попытка возможна только после user authority |
| Reconnect терял активный хвост | Token deltas были live-only, а durable projection обновлялась лишь на `Ended`; новый SSE-клиент видел устаревший накопленный текст | `publish-llm-event.ts`, `message-updater.ts`, Session events | Полные накопленные `Text/Reasoning/Tool.Input.Progress` snapshots каждые 512 новых символов или 500 мс; финальный `Ended` остаётся точной границей |
| Зависший provider держал drain | Сокет без событий не являлся failure, поэтому существующий bounded retry не запускался | provider runner/config, Settings Recovery | Opt-in watchdog: 120 с inactivity и 15 мин absolute по умолчанию после включения; значения редактируются, timeout классифицируется как transient transport |
| runaway tool/stream/inbox | Не было явных верхних границ на локальное выполнение tools, накопление input и streamed bytes | runtime config, runner, prompt admission, Session status | Конфигурируемые caps с безопасными defaults; превышающий tool не выполняется, exact input retry сохраняет идемпотентность, UI показывает причину `paused` |
| Child Session не запускался до результата | Spawn создавал durable child, но не будил execution; `/sub-agent` не self-drive-ился, `wait` polling-ил без ownership | `session/spawner.ts`, `spawn-dispatch.ts`, `tool/spawn.ts`, `tool/wait.ts`, runner drive | Wake после durable admission, startup wake только eligible inputs, явный spawn permission, durable quotas, self-drive до `exit`, прямое владение parent→child и event-driven wait |
| MCP secrets/timeout/status | Config HTTP/export возвращал runtime credentials; log notification мог писать произвольный payload; startup timeout игнорировался; connect всегда отвечал `true` | public config projection, ConfigStoreWrite, MCP runtime/handlers | Значения env/headers/OAuth secret заменяются на `<redacted>`, placeholder не затирает secret при round-trip, payload не логируется, startup fallback соблюдается, connect возвращает реальный status |
| `Add Model` выглядел зависшим | Диалог создавал tracked presets Resource внутри `dialog.push()` transition; зависший HTTP удерживал commit, а frontend probe не имел собственного deadline | `dialog-new-model.tsx`, `fs-api.ts` | Custom endpoint отображается сразу, presets загружаются после mount; presets/probe прерываются через 5/7 секунд и возвращают управляемую ошибку |

## Границы восстановления stream

Автовосстановление намеренно ограничено:

- только transient provider/transport failure;
- только если assistant уже начал выдавать text/reasoning;
- только если в оборванном ответе не было ни одного tool protocol event;
- максимум одна автоматическая попытка на drain;
- partial assistant сохраняется как наблюдаемая история и перечитывается перед продолжением.

Это устраняет наиболее частый сетевой обрыв, не создавая скрытого повторного выполнения инструментов.

## Восстановление после process loss

- `provider_recovery` записывается до чтения stream и очищается на success, ordinary failure и Stop; SIGKILL оставляет доказательство незавершённой попытки.
- Обычный advisory wake без нового input не вызывает provider повторно.
- Явный Resume или новый prompt добавляет synthetic warning и recovery steer поверх durable history.
- Незавершённые tools получают `unknown outcome`; runtime их не запускает повторно.
- UI fold сравнивает attempt ID, поэтому запоздалый `Settled` старой попытки не очищает более новую.

## Изменённые поверхности

- `packages/app/src/components/settings-v2/integrations.tsx`
- `packages/app/src/components/settings-v2/dialog-new-model.tsx`
- `packages/app/src/utils/fs-api.ts`
- `packages/app/src/components/settings-v2/integrations-model.ts`
- `packages/app/src/components/settings-v2/integrations.test.ts`
- `packages/app/src/components/settings-v2/dialog-settings-v2.tsx`
- `packages/app/src/components/settings-v2/settings-v2.css`
- `packages/app/src/i18n/en.ts`
- `packages/app/src/i18n/ru.ts`
- `packages/app/src/app.tsx`
- `packages/core/src/session/runner/llm.ts`
- `packages/core/src/session/runner/provider-watchdog.ts`
- `packages/core/src/session/runner/runtime-guards.ts`
- `packages/core/src/session/runner/publish-llm-event.ts`
- `packages/core/src/config/runtime-guards.ts`
- `packages/core/src/config/public.ts`
- `packages/core/src/session/projector.ts`
- `packages/core/src/session/message-updater.ts`
- `packages/core/src/session/spawn-dispatch.ts`
- `packages/core/src/session/spawner.ts`
- `packages/core/src/tool/spawn.ts`
- `packages/core/src/tool/wait.ts`
- `packages/core/src/database/migration/20260801190243_add_session_provider_recovery.ts`
- `packages/schema/src/session-provider-recovery.ts`
- `packages/schema/src/session-event.ts`
- `packages/app/src/pages/session/composer/session-provider-recovery-dock.tsx`
- `packages/app/src/pages/session/composer/session-runtime-guard-dock.tsx`
- `packages/app/src/components/settings-v2/recovery.tsx`
- `packages/httpapi-codegen/src/index.ts`
- `packages/core/test/session-runner.test.ts`
- `packages/desktop/src/main/menu.ts`
- `packages/novaclaw/src/mcp/index.ts`
- `packages/novaclaw/src/server/routes/instance/httpapi/handlers/config.ts`
- `packages/novaclaw/src/server/routes/instance/httpapi/handlers/global.ts`
- `packages/novaclaw/src/server/routes/instance/httpapi/handlers/mcp.ts`

## Проверка

| Проверка                                      | Результат |
| --------------------------------------------- | --------- |
| Monorepo typecheck                            | 18/18 tasks pass |
| Core combined targeted run                    | 170 pass; 1 host-environment failure, см. ниже |
| Runtime guard reducer                         | 3 pass, 0 fail |
| Runner: 33-й tool call не исполняется         | pass; исполнены только первые 32 |
| Inbox cap + exact retry                       | pass |
| Local execution `paused` projection           | pass |
| App Session/control folds                     | 16 pass, 0 fail |
| Add Model responsiveness regression           | 7 pass, 0 fail |
| MCP lifecycle, headers, timeout               | 36 pass, 0 fail |
| PII Parser portable node-lint gate            | typecheck 18/18; oxlint 0 errors |
| Client + legacy SDK regeneration              | pass |
| Migration drift check                         | pass; no schema changes pending |
| App production build                          | pass; entry 743111 bytes, max chunk 978306 bytes |
| Desktop prebuild + sidecar                    | pass |
| Desktop production build                      | pass; chunk budget pass |
| Linux package: AppImage/deb/rpm/pacman        | pass; все четыре собраны одним финальным проходом |
| Package format/content inspection             | pass for AppImage/deb/rpm/pacman |
| `git diff --check`                             | pass |

Единственный fail в комбинированном core run не относится к NovaClaw: login shell дописал в stdout `pyenv: cannot rehash: /home/jinx/.pyenv/shims isn't writable`, из-за чего fixture, ожидавший точную строку `Hi world from bot`, получил предупреждение перед ней. Все SessionRunner/runtime-guard тесты в том же запуске прошли.

### Известная неисправность старого тестового harness

`packages/novaclaw/test/server/httpapi-mcp.test.ts`: 1 pass, 4 fail. Fixture помещает `mcp.demo` в legacy project config после перехода runtime-конфига в instance-wide SQLite stores; V2 HTTP handler закономерно видит `{}` и возвращает 404 для несуществующего `demo`. Фактический MCP runtime отдельно подтверждён lifecycle/headers/timeout suite (36/36). Это baseline-дефект fixture, не регрессия внесённых изменений. В комбинированном sandbox-run ещё два теста не смогли bind-ить ephemeral port (`EADDRINUSE`); они также не отражают packaged runtime.

## Linux-артефакты

Каталог: `packages/desktop/dist/`

| Файл                                     |    Размер | SHA-256                                                            |
| ---------------------------------------- | --------: | ------------------------------------------------------------------ |
| `novaclaw-desktop-linux-x86_64.AppImage` | 181387823 | `50463d5ae16ed2a636d71a08177952c2fc2bb91b989d778c2d7bcd9257f22bf8` |
| `novaclaw-desktop-linux-amd64.deb`       | 138918444 | `ba7a8c6dc67ca03365b51fb6dd5e43f6540d628ee8e386487715b020f2419d15` |
| `novaclaw-desktop-linux-x86_64.rpm`      | 113470159 | `2c43379de26cea4d40f55c6a64976e78a27589046eaa0479f332567382fecece` |
| `novaclaw-dev-0.1.0-x64.pkg.tar.zst`     | 166294099 | `e40cc50702a21736717b746d7e9d41f2579b6da8a2d6e23bbc39bf9934a3ef44` |

Форматы распознаны штатными инструментами; содержимое deb/rpm/pacman проиндексировано. В compiled main присутствуют public MCP redaction и runtime guard status, в renderer bundle — соответствующие Recovery/Integrations проекции.

## Ручная приёмка после установки

1. Включить уровень интерфейса Advanced и открыть **Settings → Integrations**.
2. Добавить локальный MCP argv, например `["bun", "run", "server.ts"]`, либо HTTPS endpoint; проверить появление и переключение статуса.
3. Добавить путь или URL каталога skills; создать новую сессию и проверить discovery.
4. Во время генерации кратко оборвать provider connection: partial text должен сохраниться, а одна попытка — продолжить с места обрыва.
5. Переключать раскладку Alt+Shift в composer: caret и input focus должны оставаться в редакторе.
6. В **Settings → Recovery** включить watchdog, выставить малый inactivity timeout на тестовом provider и проверить видимый Retry без зависшего composer.
7. Убить тестовый процесс после dispatch, перезапустить, открыть сессию: recovery dock должен появиться, но provider не должен вызываться до Resume.
8. Выставить малый tool-call cap: превышающий вызов не должен исполниться, Session должна показать `paused`; после осознанного изменения лимита продолжить вручную.
9. Запустить `/sub-agent`, дождаться его через `wait` и проверить доставку `exit(result)` в открытую parent Session; попытка ждать чужой child Session должна быть отклонена.
10. Экспортировать config и убедиться, что MCP env/header/OAuth secrets имеют значение `<redacted>`; повторный импорт такого файла не должен стереть сохранённые secrets.

## Оставшийся scope

- Context parity: selected-agent model/request policy, provider-family baseline, configured/nested instructions, reference alias expansion, attachment materialization, plugin transforms и structured output.
- Background lifecycle: атомарные cluster-safe quotas, configurable quota policy, parent-stop propagation и явные cancel/failure controls.
- Integrations administration: persistent MCP edit/remove, status/reload diagnostics, отдельный защищённый secret-write flow; skills validation/preview/reload/per-agent visibility и permission parity slash-команд.
- Public config/export намеренно не является резервной копией MCP secrets: redaction — часть security contract.

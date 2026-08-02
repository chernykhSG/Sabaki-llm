# Findings & Decisions — плагинная архитектура Sabaki-llm

## Requirements
- Основной репозиторий (SabakiHQ/Sabaki) должен быть легко обновляемым.
- Весь наш LLM/агентский функционал должен жить как обособляемый "плагин".
- Нужны постоянные файлы плана/лога в репозитории (этот файл + task_plan.md
  + progress.md), не только временный Plan Mode файл.

## Research Findings

### Апстрим vs форк — масштаб расхождения
- Форк отделился от SabakiHQ/Sabaki на коммите `4d06ebdb` ("Prepare release
  v0.52.2", 2022-09-04). История общая и линейная с 2015 года (не shallow-clone).
- Апстрим не выпускал релизов почти до недавнего времени, затем v0.60.0
  ("The first release in a while") и v0.60.2 — единственный актуальный максимум.
- Между v0.52.2 и v0.60.2: 180 коммитов, 126 файлов, 12 авторов (апстрим).
- Наш форк за то же время: 117 коммитов, 202 файла, +21589/-12385 строк.
- **Критично**: v0.60.0 полностью убрал `@electron/remote` в пользу IPC-моста
  между main/renderer, Electron поднят с 13 до 43. v0.60.0 также добавил
  Playwright e2e-тесты для Electron-приложения (пригодится, если позже
  решим делать скриншот-тесты).

### @electron/remote — масштаб зависимости
- Используется в 37 файлах репозитория, но **27 из них уже использовали
  `remote` на момент форка** (это существовавший в апстриме на тот момент
  паттерн, наш LLM-код его просто скопировал).
- Наши 8 plugin-файлов, которые придётся мигрировать вручную при будущем
  merge: `ai.js`, `mcpHelper.js`, `gobanMcpEndpoints.js`, `promptManager.js`,
  `gameReviewer.js`, `ragManager.js`, `embeddingGenerator.js`, `aiManager.js`
  (+ LLM-related часть `PreferencesDrawer.js`).

### Природа правок в файлах ядра (git diff 4d06ebdb..HEAD)
| Файл | Дифф | Характер |
|------|------|----------|
| `src/modules/commands.js` | +181/-0 | Полностью новый, чистые данные (61 GTP/KataGo-команда), используется только `mcpHelper.js` |
| `src/components/DrawerManager.js` | +13/-1 | Образцовый "plugin slot": импорт + `h(...)` в render() |
| `src/menu.js` | +38/-15 | Один чистый пункт меню (Game Review), остальное — несвязанные правки (перенос Preferences, координаты) |
| `src/modules/sabaki.js` | +232/-5 | 3 строки в конструкторе + цельный блок ~64 строк методов в конце класса; ПОЛОВИНА диффа — несвязанные правки (история позиций файла, findVertexMove/clickVertex, changeDownstreamVariation) |
| `src/components/App.js` | +77/-18 | Вся LLM-часть — ОДНА строка `sabaki.openDrawer('ai-chat')`; остальное — preact/compat миграция, auto-connect движков, beforeunload |
| `src/modules/enginesyncer.js` | +5/-1 | Баг-фикс координат, не LLM |
| `src/main.js` | +42/-4 | LLM-мотивированные, но небезопасные правки: `webSecurity: false`, `allowRunningInsecureContent`, безусловный `openDevTools()`, `can-close-window` IPC — самая чувствительная точка для будущего merge, НЕ трогаем в Phase 1 |

### Публичный API ядра, используемый LLM-слоем
- `sabaki.state.attachedEngineSyncers` — стабильный, штатный контракт ядра
  (существовал уже на 4d06ebdb), используется одинаково и ядром, и нашим кодом.
- `mcpHelper.js` (4 места, строки ~767-1111) и `gameReviewer.js` при отсутствии
  attached-движка сами делают `import engineSyncer from './enginesyncer.js'`
  + `new engineSyncer(engine)` + прямая работа с `syncer.controller`,
  `syncer.queueCommand`, событием `analysis-update` — это хрупкая точка,
  обращение к деталям реализации, а не к документированному контракту.
- `gameReviewer.js` уже содержит готовый прототип адаптера —
  `resolveEngineSyncer()` (строки ~30-49) — нужно вынести и переиспользовать,
  а не дублировать логику ещё раз.
- `agentOrchestrator.js` (~2350 строк) с движком напрямую почти не работает:
  обращается только к `sabaki.aiManager`, `sabaki.state` (gameTrees/gameIndex/
  treePosition/gobanTransformation). Низкая связанность — трогать не нужно.
- `sabaki.addMarker`/`removeMarker`, вызываемые из `gobanMcpEndpoints.js`, НЕ
  найдены определёнными нигде в `sabaki.js` — это уже сейчас нерабочий/мёртвый
  код (известный баг из прошлой сессии), вне скоупа этого плана.

### Физическая раскладка / список новых файлов (не существовавших в апстриме на 4d06ebdb)
25 файлов в `src/` + `llm_prompts/` (2 файла, не переносим) + 3 файла в `docs/` (не переносим):

- **Агенты/оркестрация**: `src/modules/agent.js`, `agentOrchestrator.js`, `golaxyAgent.js`
- **LLM-инфраструктура**: `src/modules/ai.js`, `aiManager.js`, `promptManager.js`
- **MCP/инструменты**: `src/modules/mcpHelper.js`, `gobanMcpEndpoints.js`, `commands.js`
- **RAG**: `src/modules/ragManager.js`, `vectorStore.js`, `embeddingGenerator.js`
- **Разбор партии**: `src/modules/gameReviewer.js`, `gameReviewMath.js`, `src/components/drawers/GameReviewDrawer.js`
- **Golaxy**: `src/components/golaxy.js`, `go_communicate.js`, `GolaxyLivePanel.js`
- **UI**: `src/components/drawers/AIChatDrawer.js` (+`.css`), `src/modules/BoardDisplayController.js`
  (⚠ аномалия: написан на чистом React, а не `preact/compat`, как весь остальной проект — стоит
  поправить заодно с переносом)
- **Не переносим**: `src/polyfills.js` (webpack entry-level, не логически часть плагина)

Входящие зависимости плагина от ядра: `sabaki.js`, `i18n.js`, `enginesyncer.js`,
`gametree.js`, `gobantransformer.js`, `helper.js`, `setting.js`, `dialog.js`,
`components/drawers/Drawer.js`.

### Сборка
- `package.json.build.files` уже исключает `src/modules`/`src/components/
  {helpers,sidebars,bars}` из финальной упаковки electron-builder (весь код
  инлайнится в `bundle.js` через webpack) — расположение исходников в
  `src/plugins/...` не влияет на сборку/размер пакета.
- `webpack.config.js`: единственный entry `['./src/polyfills.js',
  './src/components/App.js']`, alias только под preact/compat,
  `resolve.fallback.crypto`, `CopyWebpackPlugin` для `i18n/`. LLM-специфичных
  alias/entry нет — перенос файлов не требует правок webpack.
- Тесты: `run_tests.js` исполняет `node <file>.js` для файлов в `test/` не
  оканчивающихся на `Tests.js`. Единственный тест с реальным `require()` на
  переносимый файл — `test/test_game_review_math.js` (require
  `gameReviewMath.js`) — путь надо поправить после переноса, иначе тест
  сломается молча.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| `git merge` вместо submodule/subtree | Общая линейная история с 2015 года — git 3-way merge работает напрямую, subtree/submodule только усложнили бы |
| Мерджиться в конкретный тег (`v0.60.2`), не в `upstream/master` | Воспроизводимая точка, а не подвижная HEAD |
| Не rebase всей нашей истории поверх апстрима | Переписал бы hash'и 117 публичных коммитов, каждый будущий merge заново расходился бы с нуля |
| Физический перенос ДО merge, не одновременно с ним | К моменту merge конфликты в sabaki.js/App.js/menu.js/DrawerManager.js будут сведены к минимальному, узнаваемому "шву" |
| `pluginEngineAdapter.js` как единая точка работы с EngineSyncer | Изолирует хрупкую зависимость от деталей реализации ядра в одном файле вместо 5 разрозненных мест в 2 модулях |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| (пока нет — Phase 1 ещё не начата) | |

## Resources
- Апстрим: https://github.com/SabakiHQ/Sabaki
- Точка форка: коммит `4d06ebdb` ("Prepare release v0.52.2")
- Утверждённый план (Plan Mode): `C:\Users\User\.claude\plans\melodic-snuggling-oasis.md`
- Прошлые связанные спеки этой же сессии: разбор партии по ходам (`src/modules/gameReviewer.js`,
  коммит `23cb3e95`), русификация UI/LLM-строк (коммиты `553941a6`, `182688d5`)

## Visual/Browser Findings
- Страница релизов SabakiHQ/Sabaki (WebFetch): последний релиз v0.60.2
  (2026-07-09 — дата совпадает с текущим годом сессии, апстрим почти не
  развивался с v0.52.2 до этого большого релиза).
- CHANGELOG.md апстрима: v0.60.0 — "Removed the deprecated @electron/remote
  dependency and moved main/renderer communication onto a proper IPC bridge",
  "Upgraded Electron from 13 all the way to 43", "Added a Playwright
  end-to-end test suite for the Electron app".

---
*Обновляется по мере находок в Phase 1-5.*

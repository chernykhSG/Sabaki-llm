# Task Plan: Плагинная архитектура для LLM-слоя + подготовка к обновлению апстрима

## Goal
Часть 1 (завершена, 2026-08-02): физически вынести весь LLM/агентский
функционал в `src/plugins/llm-coach/` за узкую точку подключения
(`sabaki.registerPlugin`).

Часть 2 (начата 2026-08-03, см. Phase 6+): собственно `git merge
upstream/v0.60.2` + миграция `@electron/remote` → IPC в 8 plugin-файлах, по
runbook в `docs/guides/upstream-merge.md`. Пользователь подтвердил старт.

## Next Step
Merge закоммичен (`d77c4446`, ветка `merge/upstream-v0.60.2`), включает
Phase 6 (разрешение конфликтов) + Phase 7 (миграция remote→IPC).
Автоматический smoke-тест через агента невозможен — sandbox выставляет
`ELECTRON_RUN_AS_NODE=1`, что ломает `require('electron')` (не баг кода,
см. progress.md). **Ручная проверка в приложении — за пользователем**, в
своём терминале. После неё — слияние ветки в master и push.

## Current Phase
Phase 8 (ждём ручную проверку пользователя, затем merge в master + push)

## Phases

### Phase 1: Физический перенос файлов
- [x] Создать структуру `src/plugins/llm-coach/{agents,llm,mcp,rag,review,golaxy,ui}/`
- [x] `git mv` 21 LLM-файл + `commands.js` (список — см. findings.md; итоговое число
      файлов — 21, не 25 как было в первой оценке агента)
- [x] Поправить относительные импорты внутри перенесённых файлов (плюс попутно
      найдены и поправлены ссылки на старые пути СНАРУЖИ плагина: `sabaki.js`,
      `DrawerManager.js`, `LeftSidebar.js`, `index.html`, 7 тестовых файлов)
- [x] Поправить путь в `test/test_game_review_math.js`
- [x] `npm run bundle` — без ошибок (только 5 старых warning)
- [x] `node run_tests.js` — 8/8 тестов проходят
- **Status:** complete

### Phase 2: `sabaki.registerPlugin()`
- [x] В `src/modules/sabaki.js`: заменить 3 инициализации на `this.plugins = new Map()`
      + `this.pluginMenuItems = []` + `this.pluginDrawers = []` + `this.registerPlugin(llmCoachPlugin)`
- [x] Добавить методы `registerPlugin(plugin)`/`getPlugin(id)` рядом с существующим
      LLM-блоком методов в конце класса (блок sendLLMMessage и т.д. не тронут)
- [x] Создать `src/plugins/llm-coach/index.js` с `init(sabaki)`, который сам
      наполняет `sabaki.pluginMenuItems`/`sabaki.pluginDrawers` (не статический
      экспорт — замыкание над реальным `sabaki`, проще и без доп. передачи параметров)
- [x] `DrawerManager.js`: убрал импорты AIChatDrawer/GameReviewDrawer, заменил
      ручные `h(...)` на `...sabaki.pluginDrawers.map(...)` (читает `sabaki`
      singleton напрямую, не через props) — заодно починился баг `show: true`
- [x] `menu.js`: пункт Game Review — через `sabaki.pluginMenuItems`, с i18n.t()
      внутри `index.js` (иначе перевод из ru.i18n.js потерялся бы)
- [x] `npm run bundle` — без ошибок; `node run_tests.js` — 8/8
- **Status:** complete
- **Отклонение от исходного плана:** `App.js`-строку `sabaki.openDrawer('ai-chat')`
  решил НЕ трогать (план предполагал завести её через реестр плагина). При
  реализации оказалось, что это самодостаточный вызов без единого импорта
  LLM-кода — реальной конфликтной поверхности для будущего merge не создаёт,
  а обёртка вида `sabaki.getPlugin('llm-coach')?.onAppReady?.(sabaki)` добавила
  бы косвенность без выигрыша. См. также риск синхронности: перенос
  инициализации aiManager/agentOrchestrator/boardDisplayController из
  конструктора Sabaki в componentDidMount (App.js) сдвинул бы момент их
  появления с "сразу при первом импорте sabaki.js" на "после первого рендера" —
  решил оставить `registerPlugin` вызовом внутри конструктора, чтобы не менять
  тайминг существующего поведения.

### Phase 3: `pluginEngineAdapter.js`
- [x] Вынести `resolveEngineSyncer()` + `analyzePosition()` из `gameReviewer.js`
      в `src/plugins/llm-coach/mcp/pluginEngineAdapter.js`
- [x] Переключить `gameReviewer.js` на адаптер (удалены локальные копии функций)
- [x] Переключить 4 места дублирования в `mcpHelper.js` на адаптер; попутно
      унифицирована остановка ad-hoc движка в `handleKataGoAnalysis` (раньше
      единственный из четырёх методов не останавливал созданный им же
      экземпляр EngineSyncer — теперь как и остальные 3, через `ownsSyncer`)
- [x] Удалён неиспользуемый импорт `engineSyncer` из `mcpHelper.js`
- [x] `npm run bundle`/`node run_tests.js` — чисто, 8/8
- **Status:** complete

### Phase 4: Обвязка и git-подготовка
- [x] `package.json.build.files`: добавлено `"!src/plugins${/*}"`
- [x] Добавлен `upstream` remote (SabakiHQ/Sabaki), `git fetch upstream --tags`
      выполнен — все теги подтянуты, включая v0.60.2
- [x] Написан `docs/guides/upstream-merge.md` (runbook будущего merge:
      горячие точки, чек-лист миграции @electron/remote → IPC для 8
      plugin-файлов, порядок проверки)
- **Status:** complete

### Phase 5: Верификация и коммиты
- [x] `npm run bundle` — без новых ошибок/warning (проверялось после каждой фазы)
- [x] `node run_tests.js` — 8/8 (проверялось после каждой фазы)
- [ ] `npm start`/`npm run watch-dev` — ручная проверка в реальном приложении
      (AI Chat, Game Review) — делает пользователь сам, как договорились
- [x] Атомарные коммиты по каждому логическому шагу: `f6b32064` (перенос +
      registerPlugin), `4fae1798` (pluginEngineAdapter), плюс этот коммит
      (build.files + upstream remote + runbook)
- [x] `git push` после каждого коммита
- **Status:** complete (кроме ручной проверки в приложении — за пользователем)

### Phase 6: git merge upstream/v0.60.2
- [x] Ветка `merge/upstream-v0.60.2` от `master`
- [x] `git merge v0.60.2 --no-ff --no-edit` (тег, не upstream/v0.60.2)
- [x] Разобраны все 19 конфликтующих файлов (список и находки — см.
      progress.md): .gitignore, package.json, webpack.config.js,
      src/setting.js, src/i18n.js, src/main.js, src/modules/sabaki.js,
      src/menu.js, src/components/App.js, src/components/DrawerManager.js,
      src/components/Goban.js, src/components/LeftSidebar.js,
      src/components/MainView.js, src/components/drawers/PreferencesDrawer.js,
      style/app.css, style/index.css, .github/workflows/create-release.yml,
      ci/extractInfo.js (git rm)
- [x] package-lock.json — перегенерирован через `npm install`, чисто
- [x] `npm run bundle` — успешно, 3 старых предупреждения (chromadb), новых ошибок нет
- [x] `node run_tests.js` — 8/8 тестов пройдено
- **Status:** complete

### Phase 7: Миграция @electron/remote → IPC в plugin-файлах
- [x] Найдены 9 файлов (не 8 — добавился embeddingGenerator.js):
      `llm/ai.js`, `llm/aiManager.js`, `llm/promptManager.js`,
      `mcp/mcpHelper.js`, `mcp/pluginEngineAdapter.js`, `ui/GameReviewDrawer.js`,
      `mcp/gobanMcpEndpoints.js`, `rag/ragManager.js`, `rag/embeddingGenerator.js`
- [x] Все мигрированы на `window.sabaki.setting.get/set` прокси (или
      `window.sabaki.setting.userDataDirectory`/`window.sabaki.dialog.
      showMessageBox` где нужно) — детали см. progress.md
- [x] Убран `enableRemoteModule: true` + `require('@electron/remote/main').
      enable(...)` из `src/main.js`
- [x] Убрана зависимость `@electron/remote` из `package.json`
- [x] `npm install` + `npm run bundle` + `node run_tests.js` — чисто
- **Status:** complete

### Phase 8: Коммит merge + верификация + push
- [x] `npm run bundle`, `node run_tests.js` — чисто (после Phase 6 и после Phase 7)
- [ ] Коммит merge (`git commit`, НЕ squash) — включает Phase 6 + Phase 7
- [ ] Ручная проверка в приложении (`npm start`/`npm run watch-dev`):
      SGF/GIB/NGF/UGF импорт-экспорт, синхронизация движков, GTP-консоль,
      доска, AI Chat, Game Review, русский интерфейс, Preferences, закрытие
      окна — одним заходом, как договорились
- [ ] Слияние `merge/upstream-v0.60.2` в `master`, push
- **Status:** in_progress

## Key Questions
1. Нужно ли переносить `llm_prompts/` и docs-файлы в этот же заход? — Нет,
   осознанно отложено (см. план, раздел "Не входит").
2. Нужно ли делать сам `git merge upstream/v0.60.2` сейчас? — Да, пользователь
   подтвердил 2026-08-03 (см. Phase 6+).

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| git merge (не submodule/subtree) для апстрима | История общая и линейная с 2015 года, git сам найдёт base commit |
| Физический перенос ДО merge, не одновременно | Сужает конфликтную поверхность в sabaki.js/App.js/menu.js/DrawerManager.js перед мерджем |
| @electron/remote → IPC миграция — в Phase 2, не сейчас | 27 из 37 файлов с remote уже были такими на момент форка — приедут с мерджем автоматически; наши 8 plugin-файлов мигрировать вручную позже |
| commands.js переносим в плагин, не оставляем в ядре | Единственный потребитель — mcpHelper.js, апстрим этот файл не создавал и не расширяет |
| Единый pluginEngineAdapter.js вместо 5 разрозненных мест создания EngineSyncer | mcpHelper.js дублирует resolveEngineSyncer() из gameReviewer.js в 4 местах — хрупкая точка, апстрим уже один раз рефакторил enginesyncer.js |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| webpack: `Can't resolve './GolaxyLivePanel.js' in .../src/components` | 1 | `LeftSidebar.js` импортировал `GolaxyLivePanel.js` — мой первый grep-поиск был case-sensitive и не поймал `Golaxy...` (искал `golaxy` строчными). Исправлено на `../plugins/llm-coach/golaxy/GolaxyLivePanel.js`, пересборка прошла чисто |

## Notes
- Полный контекст решений и сырые находки — в `findings.md`.
- Хронология сессии и результаты команд — в `progress.md`.
- Исходный план (утверждён в Plan Mode) — `C:\Users\User\.claude\plans\melodic-snuggling-oasis.md`.

# Обновление ядра из апстрима (SabakiHQ/Sabaki)

Этот форк отделился от [SabakiHQ/Sabaki](https://github.com/SabakiHQ/Sabaki)
на коммите `4d06ebdb` ("Prepare release v0.52.2"). История общая и линейная
(репозиторий не является shallow-clone), поэтому подтягивание апстрима — это
обычный `git merge`, без submodule/subtree.

Весь LLM/агентский функционал вынесен в `src/plugins/llm-coach/` за узкую
точку подключения `sabaki.registerPlugin()` (см. `src/modules/sabaki.js`) —
это должно заметно сузить конфликтную поверхность по сравнению с состоянием
до этого рефакторинга (подробности и находки, которые привели к этому
решению — в `findings.md` и `task_plan.md` в корне репозитория на момент
рефакторинга; они могут быть впоследствии удалены/заархивированы после
завершения проекта).

## Разовая процедура merge

1. Подтянуть апстрим (remote `upstream` уже настроен — если нет:
   `git remote add upstream https://github.com/SabakiHQ/Sabaki.git`):
   ```
   git fetch upstream --tags
   ```

2. Смотреть [страницу релизов](https://github.com/SabakiHQ/Sabaki/releases) и
   мерджиться в конкретный тег (не в подвижный `upstream/master`), чтобы
   получить воспроизводимую точку:
   ```
   git checkout -b merge/upstream-vX.Y.Z
   git merge upstream/vX.Y.Z --no-ff
   ```

3. **Известные горячие точки**, где вероятны конфликты (проверять в первую
   очередь, даже если git не показал конфликт — стоит перечитать диф):
   - `package.json` / `package-lock.json` — build.files whitelist, scripts
     (`sync`/`update`/`create-release*` — форк-специфичные, апстрим их не
     трогает, но окружающие строки могут сдвинуться), зависимости.
   - `src/main.js` — самая чувствительная точка. На момент написания этого
     файла тут были небезопасные, LLM-мотивированные правки (`webSecurity:
     false`, `allowRunningInsecureContent: true`, безусловный
     `openDevTools()`), которые apstream, вероятно, тоже сильно переписал под
     новый IPC-мост (см. ниже про `@electron/remote`). Разрешать вручную: взять
     апстримную структуру за основу, точечно перенести осмысленные наши правки,
     решить осознанно про security-флаги (не отключать их глобально без причины).
   - `src/modules/sabaki.js` — конструктор класса и метод `registerPlugin`
     ближе к концу файла — должны остаться простыми (одна строка в
     конструкторе, один метод), но апстрим мог добавить своё состояние рядом.
   - `src/components/App.js`, `src/menu.js`, `src/components/DrawerManager.js` —
     после рефакторинга здесь минимум LLM-кода, но апстрим активно меняет эти
     файлы для своих нужд (v0.60.0 переписал их под IPC-мост).
   - `src/i18n.js` — здесь уже был найден и исправлен реальный баг (хрупкая
     eval-обёртка ломалась на минифицированных локальных языковых файлах,
     коммит `182688d5`) — при мердже сверить, не тронул ли апстрим этот же
     механизм по-своему.

4. **Миграция `@electron/remote` → IPC.** Апстрим v0.60.0 полностью убрал
   `@electron/remote` в пользу прямого IPC-моста. Большинство файлов ядра
   получат новый паттерн автоматически через сам merge. Но 8 файлов плагина
   всё ещё используют `remote.require(...)`/`import * as remote from
   '@electron/remote'` и апстрим их не тронет — придётся мигрировать вручную,
   по образцу нового паттерна, который принесёт merge (посмотреть, во что
   превратился `remote.require('./setting')` в апстримной версии `sabaki.js`
   и повторить тот же подход):
   - `src/plugins/llm-coach/llm/ai.js`
   - `src/plugins/llm-coach/llm/aiManager.js`
   - `src/plugins/llm-coach/llm/promptManager.js`
   - `src/plugins/llm-coach/mcp/mcpHelper.js`
   - `src/plugins/llm-coach/mcp/pluginEngineAdapter.js`
   - `src/plugins/llm-coach/review/gameReviewer.js`
   - `src/plugins/llm-coach/ui/GameReviewDrawer.js`
   - `src/plugins/llm-coach/rag/ragManager.js` (частично; проверить остальные
     RAG-модули на всякий случай)

   Важно: `remote.require('./xxx')` резолвится не относительно вызывающего
   файла, а через `mainModule.require()` в `@electron/remote` — то есть
   относительно `src/main.js`. После перехода на IPC этот нюанс исчезнет,
   но при миграции не пытайтесь "исправить" путь как будто это обычный
   относительный импорт.

5. После разрешения конфликтов — полная проверка:
   ```
   npm run bundle
   node run_tests.js
   npm start   # или npm run watch-dev
   ```
   Вручную: SGF/GIB/NGF/UGF импорт-экспорт, синхронизация движков,
   GTP-консоль, доска, чат с ИИ, разбор партии.

6. Коммитить merge как обычный merge-коммит (не squash) — сохраняет
   читаемую историю слияния для следующего раза.

## Периодичность

Апстрим релизится нечасто (между v0.52.2 и v0.60.0 прошло около двух лет).
Следить за [releases](https://github.com/SabakiHQ/Sabaki/releases) и
запускать эту процедуру по факту выхода нового тега, а не по расписанию.

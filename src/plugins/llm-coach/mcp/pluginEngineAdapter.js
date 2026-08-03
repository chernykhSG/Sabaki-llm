// Единая точка обращения к EngineSyncer для всего LLM-плагина.
// Изолирует хрупкую зависимость от деталей реализации ядра (syncer.controller,
// queueCommand, событие analysis-update) в одном месте — раньше эта логика
// была продублирована вручную в 4 местах mcpHelper.js и ещё раз в gameReviewer.js.
import engineSyncer from '../../../modules/enginesyncer.js'
import sabaki from '../../../modules/sabaki.js'

const setting = {
  get: (key) => window.sabaki.setting.get(key),
  set: (key, value) => window.sabaki.setting.set(key, value),
}
const ANALYSIS_TIMEOUT = 30000

// Возвращает {syncer, ownsSyncer}:
// - если к доске уже подключён движок (sabaki.state.attachedEngineSyncers[0]) —
//   ownsSyncer: false, останавливать его не нужно;
// - иначе создаёт новый EngineSyncer по конфигу из настроек — ownsSyncer: true,
//   вызывающий код обязан сам его остановить (syncer.stop());
// - если движок нигде не настроен — возвращает null.
export function resolveEngineSyncer() {
  if (
    sabaki &&
    sabaki.state &&
    sabaki.state.attachedEngineSyncers &&
    sabaki.state.attachedEngineSyncers.length > 0
  ) {
    return {syncer: sabaki.state.attachedEngineSyncers[0], ownsSyncer: false}
  }

  let engine = setting.get('gtp.engine')

  if (!engine || !engine.path) {
    let enginesList = setting.get('engines.list') || []
    if (enginesList.length > 0) engine = enginesList[0]
  }

  if (!engine || !engine.path) return null

  let syncer = new engineSyncer(engine)
  syncer.start()

  return {syncer, ownsSyncer: true}
}

// Синхронизирует движок с позицией nodeId и запускает анализ (lz-analyze),
// возвращая {winrate, bestVertex} по первому событию analysis-update
// (или null по таймауту).
export function analyzePosition(syncer, tree, nodeId, visits) {
  return syncer.sync(tree, nodeId).then(
    () =>
      new Promise(resolve => {
        let settled = false
        let timeoutId

        let finish = result => {
          if (settled) return
          settled = true

          syncer.removeListener('analysis-update', onUpdate)
          clearTimeout(timeoutId)

          syncer.controller
            .sendCommand({name: 'protocol_version'})
            .catch(() => {})
            .then(() => resolve(result))
        }

        let onUpdate = () => {
          if (!syncer.analysis) return

          let {variations} = syncer.analysis
          finish({
            winrate: syncer.analysis.winrate,
            bestVertex: variations.length > 0 ? variations[0].vertex : null
          })
        }

        timeoutId = setTimeout(() => finish(null), ANALYSIS_TIMEOUT)

        syncer.on('analysis-update', onUpdate)
        syncer.queueCommand({name: 'lz-analyze', args: [String(visits)]})
      })
  )
}

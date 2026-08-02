// Единая точка подключения LLM-плагина к ядру Sabaki.
// Вызывается один раз через sabaki.registerPlugin(llmCoachPlugin) —
// это единственное место, где ядро (src/modules/sabaki.js) знает о плагине.
import i18n from '../../i18n.js'
import AIManager from './llm/aiManager.js'
import {AgentOrchestrator} from './agents/agentOrchestrator.js'
import BoardDisplayController from './ui/BoardDisplayController.js'
import AIChatDrawer from './ui/AIChatDrawer.js'
import GameReviewDrawer from './ui/GameReviewDrawer.js'

export default {
  id: 'llm-coach',

  init(sabaki) {
    sabaki.aiManager = new AIManager(sabaki)
    sabaki.agentOrchestrator = new AgentOrchestrator()
    sabaki.boardDisplayController = new BoardDisplayController(sabaki)

    sabaki.pluginMenuItems = [
      {
        label: i18n.t('menu.tools', '&Game Review…'),
        click: () => sabaki.openDrawer('game-review')
      }
    ]

    sabaki.pluginDrawers = [
      {key: 'ai-chat', component: AIChatDrawer},
      {key: 'game-review', component: GameReviewDrawer}
    ]
  }
}

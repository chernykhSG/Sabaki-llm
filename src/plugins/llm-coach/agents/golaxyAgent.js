import {getLiveReports} from '../golaxy/golaxy.js'
import {Agent, AGENT_STATES, ERROR_TYPES, TOOL_TYPES} from './agent.js'
// Golaxy直播报告智能体类
export class GolaxyLiveReportsAgent extends Agent {
  constructor() {
    super(
      'golaxy-live-reports-agent',
      'Агент отчётов о трансляциях Golaxy',
      TOOL_TYPES.SYSTEM_INTEGRATION,
      'Агент, специализирующийся на получении и анализе данных о текущих и исторических трансляциях партий Го с платформы Golaxy'
    );
    this.addCapability('Получение данных трансляций');
    this.addCapability('Получение исторических данных');
    this.addCapability('Анализ информации о партиях');
  }

  // 实现execute方法
  async execute(params = {}) {
    this.setState(AGENT_STATES.ACTING);
    this.addHistory('action', `Получение ${params.type === 'history' ? 'исторических' : 'прямых'} отчётов Golaxy, лимит ${params.limit || 10} партий`);
    
    try {
      const {type = 'live', limit = 10} = params;
      const reports = await getLiveReports(
        type === 'live' ? 'live' : 'history',
        limit
      );
      
      const result = {
        success: true,
        data: reports,
        content: `Успешно получены данные ${type === 'live' ? 'прямых трансляций' : 'исторических'} партий, всего ${reports.length} партий`,
        agentId: this.id,
        agentName: this.name
      };

      this.setState(AGENT_STATES.IDLE);
      this.addHistory('result', result.content);
      return result;
    } catch (error) {
      console.error('Не удалось получить отчёты о трансляциях Golaxy:', error);
      const errorResult = {
        success: false,
        error: error.message || 'Не удалось получить отчёты о трансляциях Golaxy',
        agentId: this.id,
        agentName: this.name
      };
      
      this.setState(AGENT_STATES.ERROR);
      this.addHistory('error', errorResult.error);
      return errorResult;
    }
  }
  
  // 获取工具描述信息
  getToolDescription() {
    return {
      id: 'get-golaxy-live-reports',
      name: 'Получить отчёты о трансляциях Golaxy',
      description: 'Получает данные о текущих и исторических трансляциях партий Го с платформы Golaxy',
      type: this.type,
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Тип запрашиваемых отчётов: "live" (прямая трансляция) или "history" (история)',
            enum: ['live', 'history'],
            default: 'live'
          },
          limit: {
            type: 'number',
            description: 'Ограничение на количество возвращаемых партий',
            default: 10
          }
        }
      },
      handler: this.execute.bind(this)
    };
  }
}
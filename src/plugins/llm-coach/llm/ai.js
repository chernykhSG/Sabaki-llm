import mcpHelper from '../mcp/mcpHelper.js'
import {streamDefinition, hasApiKey} from 'llm-service-provider'
import sabaki from '../../../modules/sabaki.js'
import agentOrchestrator from '../agents/agentOrchestrator.js'
import promptManager from './promptManager.js'

const setting = {
  get: (key) => window.sabaki.setting.get(key),
  set: (key, value) => window.sabaki.setting.set(key, value),
}

class AIHelper {
  constructor() {
    this.humanCollaborationEnabled = false
  }
  formatParameters(parameters) {
    let result = []

    if (parameters.required && parameters.required.length > 0) {
      result.push(`Обязательные параметры: ${parameters.required.join(', ')}`)
    }

    if (parameters.properties) {
      let propsInfo = []
      for (let [name, prop] of Object.entries(parameters.properties)) {
        let propDesc = `${name} (${prop.type})`
        if (prop.description) {
          propDesc += `: ${prop.description}`
        }
        if (prop.enum) {
          propDesc += ` [допустимые значения: ${prop.enum.join(', ')}]`
        }
        if (prop.minimum !== undefined) {
          propDesc += ` [минимум: ${prop.minimum}]`
        }
        propsInfo.push(propDesc)
      }
      if (propsInfo.length > 0) {
        result.push(`Параметры: ${propsInfo.join('; ')}`)
      }
    }

    return result.length > 0 ? result.join(' | ') : 'нет'
  }

  async sendLLMMessage(message, gameContext) {
    let userMessage = message
    let parameters = {}

    if (typeof message === 'object' && message.mcp && message.mcp.tool) {
      userMessage = message.mcp.tool.description
      parameters = message.mcp.tool.parameters || {}
    }

    let fullMessage = userMessage
    if (Object.keys(parameters).length > 0) {
      const paramsStr = JSON.stringify(parameters)
      fullMessage = `${userMessage}\n\nПараметры инструмента: ${paramsStr}`
    }

    let boardContext = await agentOrchestrator.getBoardContext(gameContext)

    // Получаем информацию о партии через инструмент get-game-info
    let gameInfo = ''
    const result_tool = await agentOrchestrator._executeTool({
      name: 'get-game-info',
      type: 'info_retrieval',
      parameters: {format: 'text'}
    })
    if (result_tool && result_tool.success && result_tool.content) {
      gameInfo = result_tool.content + '\n\n'
    }

    const provider = agentOrchestrator.getCurrentProvider()
    console.log('Selected LLM provider:', provider)

    const pre_prompt = await promptManager.getPrePrompt()

    let prompt =
      pre_prompt +
      '\n' +
      gameInfo +
      'Текущее состояние партии:\n' +
      boardContext +
      '\n' +
      'Вопрос пользователя:' +
      fullMessage

    const appLang = (setting.get('app.lang') || 'ru').toLowerCase()
    const lang = appLang.startsWith('en') ? 'en' : 'ru'
    const generator = streamDefinition({
      topic: prompt,
      language: lang,
      responseFormat: 'json'
    })

    console.log('message:', fullMessage)
    let result = ''
    for await (const chunk of generator) {
      result += chunk
    }
    console.log('raw response:', result)

    const toolDetailResponse = await this.handleToolDetailRequest(
      result,
      gameContext
    )
    if (toolDetailResponse) {
      return toolDetailResponse
    }

    let parsedResponse = JSON.parse(result.replace(/```json|```/g, ''))

    // Поддержка нового формата вызова инструмента
    if (parsedResponse.action === 'tool_call' && parsedResponse.tool) {
      // Преобразуем в формат mcp
      parsedResponse = {
        mcp: {
          tool: {
            name: parsedResponse.tool.name,
            description:
              parsedResponse.tool.description ||
              `Вызов инструмента: ${parsedResponse.tool.name}`,
            parameters: parsedResponse.tool.parameters || {}
          }
        }
      }
    }

    if (parsedResponse.mcp && parsedResponse.mcp.tool) {
      let toolDescription = `${provider}: ${parsedResponse.mcp.tool.description}`

      // Проверяем, требует ли инструмент участия человека
      const toolType =
        parsedResponse.mcp.tool.type ||
        (await this.getToolType(parsedResponse.mcp.tool.name))

      // Обработка инструментов человеко-машинного взаимодействия
      if (
        toolType === 'HUMAN_COLLABORATION' ||
        (this.humanCollaborationEnabled &&
          parsedResponse.mcp.tool.parameters?.humanCollaborationRequired)
      ) {
        // Просим пользователя выполнить действие
        const userAction = await this.promptUserAction(toolDescription)

        // Если пользователь отменил действие
        if (!userAction) {
          return {
            content: `<div style="color: lightblue;">${toolDescription}</div><div style="color: yellow;">Пользователь отменил операцию</div>`
          }
        }

        // Добавляем результат действия пользователя в параметры
        parsedResponse.mcp.tool.parameters = {
          ...parsedResponse.mcp.tool.parameters,
          userAction: userAction
        }
      }

      let toolResult = await mcpHelper.handleMCPRequest(
        parsedResponse,
        gameContext
      )

      if (toolResult.error) {
        return {
          content: `<div style="color: lightblue;">${toolDescription}</div><div style="color: yellow;">Ошибка вызова инструмента: ${toolResult.error}</div>`
        }
      }

      let resultResponse = await this.sendToolResultToAI(
        message,
        toolResult.data,
        gameContext
      )

      if (resultResponse.content) {
        resultResponse.content = `<div style="color: lightblue;">${toolDescription}</div><div style="color: lightgreen;">${resultResponse.content}</div>`
      }

      return resultResponse
    } else if (parsedResponse.content) {
      return {
        ...parsedResponse,
        content: parsedResponse.content.replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      }
    }

    return parsedResponse
  }

  async sendToolResultToAI(originalMessage, toolResult, gameContext) {
    try {
      let prompt = `Обобщи результат выполнения инструмента и ответь на исходный вопрос пользователя естественным, дружелюбным языком.

Исходный вопрос пользователя: ${originalMessage.description || originalMessage}

Результат выполнения инструмента: ${JSON.stringify(toolResult, null, 2)}`

      let response = await this.sendLLMMessage(prompt, gameContext)
      return response
    } catch (err) {
      return {error: err.message}
    }
  }

  async handleToolDetailRequest(response, gameContext) {
    const toolNameMatch = response.match(
      /мне нужны подробные параметры инструмента[:\s«"]*([^»".\n]+)/i
    )

    if (toolNameMatch && toolNameMatch[1]) {
      const requestedToolName = toolNameMatch[1].trim()
      const toolDetails = agentOrchestrator.getToolDetails(requestedToolName)

      if (toolDetails) {
        let prompt =
          `Вот подробная информация об инструменте ${requestedToolName}, которую вы запросили:\n${toolDetails}\n\n` +
          'На основе этой информации реши, что делать дальше. Если хочешь использовать этот инструмент, используй формат вызова инструмента;\n' +
          'если информации уже достаточно, можешь ответить пользователю напрямую.'

        return await this.sendLLMMessage(prompt, gameContext)
      }
    }

    return null
  }

  async callMCPTool(toolId, params, gameContext) {
    try {
      let mcpMessage = mcpHelper.generateMCPMessage(toolId, params)
      if (mcpMessage.error) {
        return mcpMessage
      }

      return await mcpHelper.handleMCPRequest(mcpMessage, gameContext)
    } catch (err) {
      return {error: err.message}
    }
  }

  // Получить тип инструмента
  async getToolType(toolName) {
    try {
      // Получаем информацию о типе через agentOrchestrator
      const toolDetails = agentOrchestrator.getToolDetails(toolName)
      if (toolDetails && toolDetails.type) {
        return toolDetails.type
      }

      // Если тип не найден, ищем среди доступных инструментов
      const availableTools = await agentOrchestrator.getAvailableTools()
      const tool = availableTools.find(
        t => t.name === toolName || t.id === toolName
      )
      return tool ? tool.type : 'EXECUTION' // По умолчанию — тип EXECUTION
    } catch (err) {
      console.error('Не удалось получить тип инструмента:', err)
      return 'EXECUTION' // При ошибке — тип EXECUTION по умолчанию
    }
  }

  // Включает/выключает режим человеко-машинного взаимодействия
  setHumanCollaborationEnabled(enabled) {
    this.humanCollaborationEnabled = enabled
  }

  // Просит пользователя выполнить действие
  async promptUserAction(toolDescription) {
    return new Promise(resolve => {
      // Показываем диалог Electron с просьбой к пользователю
      window.sabaki.dialog
        .showMessageBox({
          type: 'question',
          title: 'Человеко-машинное взаимодействие',
          message: `Требуется ваше действие для выполнения: ${toolDescription}`,
          detail:
            'Пожалуйста, выполните соответствующее действие на доске, а затем подтвердите. Если хотите отменить — нажмите кнопку отмены.',
          buttons: ['Подтвердить', 'Отмена'],
          defaultId: 0,
          cancelId: 1
        })
        .then(result => {
          if (result.response === 0) {
            // Пользователь подтвердил — берём текущее состояние доски как результат действия
            const currentBoardState = sabaki.state.branch.currentNode.properties
            resolve(currentBoardState)
          } else {
            resolve(null)
          }
        })
    })
  }
}

export default new AIHelper()

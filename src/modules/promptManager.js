// Модуль управления промптами
import * as remote from '@electron/remote'

const setting = remote.require('./setting')

class PromptManager {
  constructor() {
    this.prompts = null
    this.loaded = false
  }

  // Определяет язык промптов по настройке app.lang: 'en' для английского,
  // иначе (по умолчанию) — русский.
  resolveLanguage() {
    let lang = setting.get('app.lang') || 'ru'
    return lang.toLowerCase().startsWith('en') ? 'en' : 'ru'
  }

  // Загружает конфигурацию промптов
  async loadPrompts() {
    try {
      // В окружении Electron используем динамический импорт
      const promptsModule = await import('../../llm_prompts/prompts.json')
      this.prompts = promptsModule.default || promptsModule
      this.loaded = true
      return this.prompts
    } catch (error) {
      console.error('Не удалось загрузить конфигурацию промптов:', error)
      // Возвращаем запасную конфигурацию
      return this.getDefaultPrompts()
    }
  }

  // Возвращает языковую ветку уже загруженных промптов (с запасным
  // вариантом на русский, если для выбранного языка данных нет)
  getLangPrompts() {
    return this.prompts?.[this.resolveLanguage()] || this.prompts?.ru || {}
  }

  // Запасная конфигурация промптов (на случай ошибки загрузки JSON)
  getDefaultPrompts() {
    return {
      ru: {
        pre_prompts: {
          go_assistant: {
            default:
              'Ты — ассистент по игре го, способный анализировать партии, давать советы и отвечать на вопросы о стратегии го.\n\nУ тебя есть два формата ответа (сначала пробуй вызвать инструмент):\n1. Когда нужно вызвать инструмент для анализа, используй формат mcp и не упоминай название инструмента в ответе:\n{"mcp":{"tool":{"name":"название_инструмента","description":"описание_инструмента","parameters":{объект_параметров}}}}\n\n2. Когда можешь ответить пользователю напрямую, используй формат content:\n{"content":"текст твоего ответа"}\n\n'
          }
        }
      }
    }
  }

  // Возвращает преамбулу (pre-prompt)
  async getPrePrompt(assistantType = 'go_assistant', variant = 'default') {
    if (!this.loaded) {
      await this.loadPrompts()
    }
    return this.getLangPrompts()?.pre_prompts?.[assistantType]?.[variant] || ''
  }

  // Возвращает системный промпт
  async getSystemPrompt(promptType) {
    if (!this.loaded) {
      await this.loadPrompts()
    }
    return this.getLangPrompts()?.system_prompts?.[promptType] || {}
  }

  // Возвращает промпт задачи
  async getTaskPrompt(taskType) {
    if (!this.loaded) {
      await this.loadPrompts()
    }
    return this.getLangPrompts()?.task_prompts?.[taskType] || ''
  }

  // 构建决策提示词
  async buildDecisionPrompt(
    toolsListJson,
    userMessages,
    lastToolResult = null
  ) {
    const decisionMaker = await this.getSystemPrompt('decision_maker')
    let prompt = decisionMaker.header || ''

    // 添加工具列表
    if (toolsListJson && decisionMaker.tools_section) {
      prompt +=
        decisionMaker.tools_section +
        JSON.stringify(toolsListJson, null, 2) +
        '\n\n'
    }

    // 添加用户历史消息
    if (
      userMessages &&
      userMessages.length > 0 &&
      decisionMaker.history_section
    ) {
      prompt += decisionMaker.history_section
      // 添加除最后一条外的历史消息
      for (let i = 0; i < userMessages.length - 1; i++) {
        prompt += `- ${userMessages[i].content}\n`
      }
      // 添加当前问题
      if (decisionMaker.current_question) {
        prompt += `${decisionMaker.current_question}${
          userMessages[userMessages.length - 1].content
        }\n`
      }
    }

    // 添加最近的工具执行结果
    if (lastToolResult && decisionMaker.tool_result_section) {
      prompt +=
        decisionMaker.tool_result_section +
        JSON.stringify(lastToolResult, null, 2) +
        '\n\n'
    }

    // 添加决策请求
    if (decisionMaker.decision_request) {
      prompt += decisionMaker.decision_request
    }

    // 添加格式说明
    if (decisionMaker.format_instructions) {
      const format = decisionMaker.format_instructions
      if (format.header) prompt += format.header
      if (format.tool_call) prompt += format.tool_call
      if (format.direct_answer) prompt += format.direct_answer
      if (format.ask_clarification) prompt += format.ask_clarification
    }

    return prompt
  }
}

export default new PromptManager()

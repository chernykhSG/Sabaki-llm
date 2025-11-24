// 提示词管理模块
class PromptManager {
  constructor() {
    this.prompts = null
    this.loaded = false
  }

  // 加载提示词配置
  async loadPrompts() {
    try {
      // 在Electron环境中使用动态导入
      const promptsModule = await import('../../llm_prompts/prompts.json')
      this.prompts = promptsModule.default || promptsModule
      this.loaded = true
      return this.prompts
    } catch (error) {
      console.error('加载提示词配置失败:', error)
      // 返回默认配置作为后备
      return this.getDefaultPrompts()
    }
  }

  // 获取默认提示词配置（作为后备）
  getDefaultPrompts() {
    return {
      pre_prompts: {
        go_assistant: {
          default:
            '你是一个围棋助手，能够分析棋局、提供建议并回答关于围棋策略的问题。\n\n你有两种响应格式可以使用(优先调用工具):\n1. 当你需要调用工具分析时，必须使用mcp格式，不要在response中提及工具名称:\n{"mcp":{"tool":{"name":"工具名称","description":"工具描述","parameters":{参数对象}}}}\n\n2. 当你可以直接回答用户问题时，使用content格式:\n{"content":"你的回答内容"}\n\n'
        }
      }
    }
  }

  // 获取预提示词
  async getPrePrompt(assistantType = 'go_assistant', variant = 'default') {
    if (!this.loaded) {
      await this.loadPrompts()
    }
    return this.prompts?.pre_prompts?.[assistantType]?.[variant] || ''
  }

  // 获取系统提示词
  async getSystemPrompt(promptType) {
    if (!this.loaded) {
      await this.loadPrompts()
    }
    return this.prompts?.system_prompts?.[promptType] || {}
  }

  // 获取任务提示词
  async getTaskPrompt(taskType) {
    if (!this.loaded) {
      await this.loadPrompts()
    }
    return this.prompts?.task_prompts?.[taskType] || ''
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

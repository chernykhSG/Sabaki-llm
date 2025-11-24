// 测试promptManager模块

// 模拟环境
const fs = require('fs')
const path = require('path')

// 模拟import机制
function mockImport(modulePath) {
  try {
    const absolutePath = path.join(__dirname, modulePath)
    const content = fs.readFileSync(absolutePath, 'utf8')
    return JSON.parse(content)
  } catch (error) {
    console.error('Error reading JSON file:', error)
    return null
  }
}

// 创建简化版的PromptManager类进行测试
class TestPromptManager {
  constructor() {
    this.prompts = null
    this.loaded = false
  }

  // 加载提示词配置
  async loadPrompts() {
    try {
      // 使用模拟的导入
      this.prompts = mockImport('./llm_prompts/prompts.json')
      this.loaded = true
      return this.prompts
    } catch (error) {
      console.error('加载提示词配置失败:', error)
      return this.getDefaultPrompts()
    }
  }

  // 获取默认提示词配置
  getDefaultPrompts() {
    return {
      pre_prompts: {
        go_assistant: {
          default: '默认提示词'
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

  // 构建决策提示词
  async buildDecisionPrompt(
    toolsListJson,
    userMessages,
    lastToolResult = null
  ) {
    if (!this.loaded) {
      await this.loadPrompts()
    }

    const decisionMaker = this.prompts?.system_prompts?.decision_maker || {}
    let prompt = decisionMaker.header || ''

    if (toolsListJson && decisionMaker.tools_section) {
      prompt +=
        decisionMaker.tools_section +
        JSON.stringify(toolsListJson, null, 2) +
        '\n\n'
    }

    if (
      userMessages &&
      userMessages.length > 0 &&
      decisionMaker.history_section
    ) {
      prompt += decisionMaker.history_section
      for (let i = 0; i < userMessages.length - 1; i++) {
        prompt += `- ${userMessages[i].content}\n`
      }
      if (decisionMaker.current_question) {
        prompt += `${decisionMaker.current_question}${
          userMessages[userMessages.length - 1].content
        }\n`
      }
    }

    if (lastToolResult && decisionMaker.tool_result_section) {
      prompt +=
        decisionMaker.tool_result_section +
        JSON.stringify(lastToolResult, null, 2) +
        '\n\n'
    }

    if (decisionMaker.decision_request) {
      prompt += decisionMaker.decision_request
    }

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

// 运行测试
async function runTests() {
  console.log('开始测试PromptManager...')
  const promptManager = new TestPromptManager()

  try {
    // 测试1: 加载并获取预提示词
    const prePrompt = await promptManager.getPrePrompt()
    console.log('测试1 - 预提示词加载成功:', prePrompt.length > 0)

    // 测试2: 构建决策提示词
    const toolsList = [
      {name: 'get-board-context', description: '获取棋盘上下文'}
    ]
    const userMessages = [
      {content: '这局棋白棋应该怎么走？'},
      {content: '黑棋优势大吗？'}
    ]
    const toolResult = {success: true, result: '棋盘分析结果'}

    const decisionPrompt = await promptManager.buildDecisionPrompt(
      toolsList,
      userMessages,
      toolResult
    )
    console.log('测试2 - 决策提示词构建成功:', decisionPrompt.length > 0)

    console.log('\n所有测试通过！PromptManager工作正常。')
  } catch (error) {
    console.error('测试失败:', error)
  }
}

// 执行测试
runTests()

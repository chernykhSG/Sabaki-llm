import ai from '../llm/ai.js'
import mcpHelper from '../mcp/mcpHelper.js'
import sabaki from '../../../modules/sabaki.js'
import {getSelectedServiceProvider} from 'llm-service-provider'
import promptManager from '../llm/promptManager.js'
import {Agent, AGENT_STATES, ERROR_TYPES, TOOL_TYPES} from './agent.js'
import {GolaxyLiveReportsAgent} from './golaxyAgent.js'
import * as gametree from '../../../modules/gametree.js'
import ragManager from '../rag/ragManager.js'

export class AgentOrchestrator extends Agent {
  constructor() {
    super('agent-orchestrator')
    // 主智能体状态
    this.agentState = {
      currentStep: AGENT_STATES.IDLE,
      history: [],
      conversationContext: null,
      lastActionResult: null,
      isRunning: false,
      error: null,
      executionCount: 0,
      maxSteps: 20,
      startTime: null,
      timeout: 300000,
      retryCount: 0,
      maxRetries: 3
    }
    this.humanCollaborationEnabled = true

    // 五步问题解决流程相关状态
    this.fiveStepProcess = {
      currentProcessStep: null,
      processSteps: [],
      isProcessRunning: false,
      currentStepResult: null,
      processContext: null
    }

    // 工具控制配置
    this.toolConfig = {
      includeBoardContext: true,
      boardContextMaxLength: 1000,
      toolUsageEnabled: true,
      planningEnabled: true,
      multiAgentEnabled: false,
      selfEvolvingEnabled: false
    }

    this.boardDisplayState = {
      markers: {},
      highlights: [],
      heatMap: {},
      lines: [],
      variationMoves: null,
      variationSign: 1,
      variationSibling: false,
      activeDisplayId: null,
      displayHistory: []
    }

    this.thoughtProcessHandlers = {
      analyze: this._analyzeThought.bind(this),
      plan: this._planThought.bind(this),
      decide: this._decideThought.bind(this)
    }

    this.stateListeners = []
    this.errorHandlers = []
    this.capabilityGapListeners = [] // 能力缺口监听器

    // 多智能体相关
  this.agents = {}
  this.agentInteractions = []
  this.defaultAgentId = 'main-agent'

  // 注册默认主智能体
  this._registerMainAgent()

  // 注册Golaxy直播报告智能体
  const golaxyAgent = this._registerGolaxyLiveReportsTool()
  if (golaxyAgent) {
    this.addAgent(golaxyAgent)
  }
  
  // 添加自进化功能测试监听器
  this._setupEvolvingTestListeners()
  }
  
  /**
   * 检测能力缺口
   * 分析任务需求和当前可用的工具/智能体，识别缺口
   */
  async _detectCapabilityGaps(taskDescription, context = {}) {
    if (!this.toolConfig.selfEvolvingEnabled) return null
    
    // 获取当前可用的工具和智能体能力
    const availableCapabilities = this._getAvailableCapabilities()
    
    // 使用LLM分析任务需求和能力缺口
    const prompt = `
任务描述: ${taskDescription}

当前可用的工具和能力:
${JSON.stringify(availableCapabilities, null, 2)}

请分析这个任务是否存在能力缺口。如果存在，请详细说明:
1. 缺少什么工具或智能体
2. 该工具/智能体应该具备什么核心功能
3. 为什么需要这个工具/智能体
4. 该工具可能需要什么参数

请用JSON格式输出，包含以下字段:
- hasGap: 是否存在能力缺口(true/false)
- gapType: 如果存在缺口，是'tool'还是'agent'
- gapName: 建议的工具或智能体名称
- gapDescription: 详细描述
- coreFunctions: 核心功能列表
- requiredParameters: 需要的参数列表
- reason: 需要的理由
    `
    
    try {
      const response = await ai.sendLLMMessage(prompt, context.gameContext)
      if (response && !response.error) {
        try {
          const parsedResponse = typeof response === 'object' ? response : JSON.parse(response)
          if (parsedResponse.hasGap) {
            return parsedResponse
          }
        } catch (parseError) {
          console.warn('Failed to parse capability gap analysis:', parseError)
        }
      }
    } catch (error) {
      console.warn('Capability gap detection failed:', error)
    }
    
    return null
  }
  
  /**
   * 获取当前可用的所有能力
   */
  _getAvailableCapabilities() {
    const capabilities = {
      tools: [],
      agents: []
    }
    
    // 获取可用工具
    const toolsList = mcpHelper.getAvailableEndpoints()
    capabilities.tools = toolsList.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }))
    
    // 获取智能体能力
    Object.values(this.agents).forEach(agent => {
      capabilities.agents.push({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities || []
      })
    })
    
    return capabilities
  }
  
  /**
   * 触发能力缺口事件
   */
  _triggerCapabilityGap(gapInfo) {
    this.capabilityGapListeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener(gapInfo)
      }
    })
  }
  
  /**
   * 添加能力缺口监听器
   */
  addCapabilityGapListener(listener) {
    if (typeof listener === 'function' && !this.capabilityGapListeners.includes(listener)) {
      this.capabilityGapListeners.push(listener)
    }
  }
  
  /**
   * 移除能力缺口监听器
   */
  removeCapabilityGapListener(listener) {
    this.capabilityGapListeners = this.capabilityGapListeners.filter(l => l !== listener)
  }

  // 注册Golaxy直播报告工具的方法
  _registerGolaxyLiveReportsTool() {
    // 创建智能体实例
    const golaxyAgent = new GolaxyLiveReportsAgent()

    // 获取工具描述并注册到MCP助手
    const tool = golaxyAgent.getToolDescription()

    // 注册到MCP助手
    if (mcpHelper.default && mcpHelper.default.registerEndpoint) {
      mcpHelper.default.registerEndpoint(tool)
    }

    // 返回智能体实例供后续使用
    return golaxyAgent
  }

  addStateListener(listener) {
    if (typeof listener === 'function') {
      this.stateListeners.push(listener)
    }
  }

  removeStateListener(listener) {
    this.stateListeners = this.stateListeners.filter(l => l !== listener)
  }

  addErrorHandler(handler) {
    if (typeof handler === 'function') {
      this.errorHandlers.push(handler)
    }
  }

  removeErrorHandler(handler) {
    this.errorHandlers = this.errorHandlers.filter(h => h !== handler)
  }

  _emitStateChange(newState) {
    const oldState = this.agentState.currentStep
    this.agentState.currentStep = newState

    this.stateListeners.forEach(listener => {
      listener(newState, oldState)
    })
  }

  _handleError(error, errorType = ERROR_TYPES.UNKNOWN_ERROR) {
    const errorObj = {
      type: errorType,
      message: error.message || String(error),
      stack: error.stack,
      timestamp: Date.now(),
      context: {
        currentStep: this.agentState.currentStep,
        executionCount: this.agentState.executionCount
      }
    }

    console.error('Agent error:', errorObj)
    this.agentState.error = errorObj
    this.agentState.isRunning = false

    this._emitStateChange(AGENT_STATES.ERROR)

    this.errorHandlers.forEach(handler => {
      handler(errorObj)
    })

    return errorObj
  }

// 移除类方法中间的require语句

  _checkTimeout() {
    if (!this.agentState.startTime) return false

    const elapsed = Date.now() - this.agentState.startTime
    return elapsed > this.agentState.timeout
  }

  async run(userMessage, gameContext, options = {}) {
    this.reset()

    if (options.maxSteps) this.agentState.maxSteps = options.maxSteps
    if (options.timeout) this.agentState.timeout = options.timeout
    if (options.maxRetries) this.agentState.maxRetries = options.maxRetries

    this.agentState.isRunning = true
    this.agentState.startTime = Date.now()
    this.agentState.conversationContext = {
      initialMessage: userMessage,
      gameContext: gameContext
    }

    this.agentState.history.push({
      type: 'user',
      content: userMessage,
      timestamp: Date.now()
    })

    // 初始化RAG系统并检索相关记忆
    await ragManager.initialize();
    const relevantHistory = await ragManager.importRelevantHistory(userMessage);
    
    // 将检索到的相关历史添加到对话上下文中
    if (relevantHistory) {
      this.agentState.conversationContext.relevantHistory = relevantHistory;
    }

    // 如果启用了人机协作且工具配置支持规划，优先使用五步问题解决流程（适用于自进化系统）
    if (
      this.humanCollaborationEnabled &&
      this.toolConfig.planningEnabled &&
      options.enableFiveStepProcess !== false
    ) {
      this._emitStateChange(AGENT_STATES.THINKING)
      const result = await this.runWithFiveStepProcess(
        userMessage,
        gameContext,
        options
      );
      
      // 存储当前对话到RAG系统
      await ragManager.storeMemory(
        `用户: ${userMessage}\n\n助手: ${result.response || JSON.stringify(result)}`,
        { interactionType: 'fiveStepProcess' }
      );
      
      return result;
    }
    
    // 检查是否启用多智能体模式
    if (this.toolConfig.multiAgentEnabled) {
      console.log('启动多智能体协作模式')
      const result = await this.runMultiAgent({
        query: userMessage,
        gameContext,
        options
      });
      
      // 存储多智能体对话到RAG系统
      await ragManager.storeMemory(
        `用户: ${userMessage}\n\n助手: ${JSON.stringify(result)}`,
        { interactionType: 'multiAgent' }
      );
      
      return result;
    }

    // 否则使用常规流程
    this._emitStateChange(AGENT_STATES.THINKING)
    const result = await this._loop();
    
    // 存储常规对话到RAG系统
    await ragManager.storeMemory(
      `用户: ${userMessage}\n\n助手: ${JSON.stringify(result)}`,
      { interactionType: 'regular' }
    );
    
    return result
  }

  // 多智能体协作执行方法
  async runMultiAgent(context) {
    try {
      this._emitStateChange(AGENT_STATES.THINKING)

      // 分析用户查询，确定需要使用的智能体
      const query = context.query
      let selectedAgentId = this.defaultAgentId

      // 根据查询内容选择合适的智能体
      if (
        query.includes('直播') ||
        query.includes('比赛') ||
        query.includes('Golaxy')
      ) {
        // 查找Golaxy直播报告智能体
        const golaxyAgentId = 'golaxy-live-reports-agent'
        if (
          this.agents[golaxyAgentId] &&
          this.agents[golaxyAgentId].isAvailable
        ) {
          selectedAgentId = golaxyAgentId
        }
      }

      // 获取选定的智能体
      const selectedAgent = this.getAgent(selectedAgentId)

      // 如果智能体不可用，回退到默认智能体
      if (!selectedAgent || !selectedAgent.isAvailable) {
        console.warn(`智能体 ${selectedAgentId} 不可用，回退到默认流程`)
        return await this._loop()
      }

      this._emitStateChange(AGENT_STATES.ACTING)

      // 准备参数
      let params = {}
      if (query.includes('历史')) {
        params.type = 'history'
      }

      // 执行智能体操作
      const result = await selectedAgent.execute(params)

      // 记录智能体交互历史
      this.agentInteractions.push({
        timestamp: Date.now(),
        agentId: selectedAgent.id,
        query: query,
        result: result.success ? 'success' : 'error',
        responseSummary: result.content || result.error
      })

      this._emitStateChange(AGENT_STATES.IDLE)

      // 返回智能体执行结果
      return {
        content: result.content || result.error,
        agentResponse: result,
        isFromAgent: true
      }
    } catch (error) {
      console.error('多智能体执行失败:', error)
      return this._handleError(error, ERROR_TYPES.TOOL_ERROR)
    }
  }

  // 注册默认主智能体
  _registerMainAgent() {
    const mainAgent = new Agent(
      this.defaultAgentId,
      '主智能体',
      TOOL_TYPES.HUMAN_COLLABORATION,
      '协调其他智能体工作的主智能体'
    )
    mainAgent.addCapability('任务协调')
    mainAgent.addCapability('智能体管理')
    this.addAgent(mainAgent)
  }

  // 添加智能体到注册表
  addAgent(agent) {
    if (agent && agent.id) {
      this.agents[agent.id] = agent
      console.log(`智能体 ${agent.name} (${agent.id}) 已添加到注册表`)
    }
  }

  // 从注册表移除智能体
  removeAgent(agentId) {
    if (this.agents[agentId]) {
      delete this.agents[agentId]
      console.log(`智能体 ${agentId} 已从注册表移除`)
    }
  }

  // 获取智能体
  getAgent(agentId) {
    return this.agents[agentId] || null
  }

  // 获取所有智能体
  getAllAgents() {
    return Object.values(this.agents)
  }

  // 设置多智能体模式
  setMultiAgentEnabled(enabled) {
    this.toolConfig.multiAgentEnabled = enabled
    console.log(`多智能体模式已${enabled ? '启用' : '禁用'}`)
  }

  // 重置智能体状态
  resetAgentState() {
    this.agentState = {
      currentStep: AGENT_STATES.IDLE,
      history: [],
      conversationContext: null,
      lastActionResult: null,
      isRunning: false,
      error: null,
      executionCount: 0,
      maxSteps: 20,
      startTime: null,
      timeout: 300000,
      retryCount: 0,
      maxRetries: 3
    }
  }

  reset() {
    this.resetAgentState()
    this.fiveStepProcess = {
      currentProcessStep: null,
      processSteps: [],
      isProcessRunning: false,
      currentStepResult: null,
      processContext: null
    }
  }

  addStateListener(listener) {
    if (typeof listener === 'function') {
      this.stateListeners.push(listener)
    }
  }

  removeStateListener(listener) {
    this.stateListeners = this.stateListeners.filter(l => l !== listener)
  }

  addErrorHandler(handler) {
    if (typeof handler === 'function') {
      this.errorHandlers.push(handler)
    }
  }

  removeErrorHandler(handler) {
    this.errorHandlers = this.errorHandlers.filter(h => h !== handler)
  }

  _emitStateChange(newState) {
    const oldState = this.agentState.currentStep
    this.agentState.currentStep = newState

    this.stateListeners.forEach(listener => {
      listener(newState, oldState)
    })
  }

  _handleError(error, errorType = ERROR_TYPES.UNKNOWN_ERROR) {
    const errorObj = {
      type: errorType,
      message: error.message || String(error),
      stack: error.stack,
      timestamp: Date.now(),
      context: {
        currentStep: this.agentState.currentStep,
        executionCount: this.agentState.executionCount
      }
    }

    console.error('Agent error:', errorObj)
    this.agentState.error = errorObj
    // 设置isRunning为false，确保状态完全重置
    this.agentState.isRunning = false

    this._emitStateChange(AGENT_STATES.ERROR)

    this.errorHandlers.forEach(handler => {
      handler(errorObj)
    })

    return errorObj
  }

  _checkTimeout() {
    if (!this.agentState.startTime) return false

    const elapsed = Date.now() - this.agentState.startTime
    return elapsed > this.agentState.timeout
  }

  async run(userMessage, gameContext, options = {}) {
    this.reset()

    if (options.maxSteps) this.agentState.maxSteps = options.maxSteps
    if (options.timeout) this.agentState.timeout = options.timeout
    if (options.maxRetries) this.agentState.maxRetries = options.maxRetries

    this.agentState.isRunning = true
    this.agentState.startTime = Date.now()
    this.agentState.conversationContext = {
      initialMessage: userMessage,
      gameContext: gameContext
    }

    this.agentState.history.push({
      type: 'user',
      content: userMessage,
      timestamp: Date.now()
    })

    // 如果启用了人机协作且工具配置支持规划，优先使用五步问题解决流程（适用于自进化系统）
    if (
      this.humanCollaborationEnabled &&
      this.toolConfig.planningEnabled &&
      options.enableFiveStepProcess !== false
    ) {
      this._emitStateChange(AGENT_STATES.THINKING)
      return await this.runWithFiveStepProcess(
        userMessage,
        gameContext,
        options
      )
    }

    // 检查是否启用多智能体模式
    if (this.toolConfig.multiAgentEnabled) {
      console.log('启动多智能体协作模式')
      return await this.runMultiAgent({
        query: userMessage,
        gameContext,
        options
      })
    }

    // 重新检查五步流程条件（保持原有结构）
    if (
      this.humanCollaborationEnabled &&
      this.toolConfig.planningEnabled &&
      options.enableFiveStepProcess !== false
    ) {
      this._emitStateChange(AGENT_STATES.THINKING)
      return await this.runWithFiveStepProcess(
        userMessage,
        gameContext,
        options
      )
    }

    // 否则使用常规流程
    this._emitStateChange(AGENT_STATES.THINKING)
    const result = await this._loop()
    return result
  }

  /**
   * 五步问题解决流程
   * 1. 明确任务 - 理解和澄清用户请求
   * 2. 感知环境 - 收集相关信息和上下文
   * 3. 思考规划 - 制定解决方案和执行计划
   * 4. 执行行动 - 按照计划执行具体操作
   * 5. 观察迭代 - 评估结果并根据需要调整
   */
  async runWithFiveStepProcess(userMessage, gameContext, options = {}) {
    // 初始化五步流程状态
    this.fiveStepProcess = {
      currentProcessStep: null,
      processSteps: [
        {
          id: 'task_clarification',
          name: '明确任务',
          description: '理解和澄清用户请求'
        },
        {
          id: 'environment_perception',
          name: '感知环境',
          description: '收集相关信息和上下文'
        },
        {
          id: 'planning',
          name: '思考规划',
          description: '制定解决方案和执行计划'
        },
        {
          id: 'execution',
          name: '执行行动',
          description: '按照计划执行具体操作'
        },
        {
          id: 'observation',
          name: '观察迭代',
          description: '评估结果并根据需要调整'
        }
      ],
      isProcessRunning: true,
      currentStepResult: null,
      processContext: {
        userMessage: userMessage,
        gameContext: gameContext,
        options: options,
        stepResults: {},
        processStartTime: Date.now()
      }
    }

    try {
      // 第一步：生成五步问题解决流程的详细步骤
      const processPlan = await this._generateFiveStepPlan(
        userMessage,
        gameContext
      )
      if (processPlan.error) {
        return {error: processPlan.error}
      }

      // 将生成的步骤计划保存到流程上下文
      this.fiveStepProcess.processContext.stepPlan = processPlan.steps || []

      // 返回五步流程计划，等待用户确认
      const formattedPlan = this._formatProcessPlan(processPlan.steps)
      return {
        content: formattedPlan.text || formattedPlan,
        button: formattedPlan.button,
        processPlan: processPlan.steps,
        requiresHumanConfirmation: true
      }
    } catch (error) {
      return this._handleError(error, ERROR_TYPES.LLM_ERROR)
    }
  }

  /**
   * 执行五步流程中的特定步骤
   */
  async executeProcessStep(stepIndex, processContext) {
    if (
      !processContext ||
      !processContext.stepPlan ||
      stepIndex < 0 ||
      stepIndex >= processContext.stepPlan.length
    ) {
      return {error: '无效的流程步骤索引'}
    }

    const step = processContext.stepPlan[stepIndex]
    this.fiveStepProcess.currentProcessStep = step.id
    this._emitStateChange(AGENT_STATES.THINKING)

    try {
      // 根据步骤类型执行不同的逻辑
      let stepResult
      switch (step.id) {
        case 'task_clarification':
          stepResult = await this._executeTaskClarification(
            step,
            processContext
          )
          break
        case 'environment_perception':
          stepResult = await this._executeEnvironmentPerception(
            step,
            processContext
          )
          break
        case 'planning':
          stepResult = await this._executePlanning(step, processContext)
          break
        case 'execution':
          stepResult = await this._executeActions(processContext)
          break
        case 'observation':
          stepResult = await this._executeObservation(step, processContext)
          break
        default:
          stepResult = {error: `未知的流程步骤: ${step.id}`}
      }

      if (stepResult.error) {
        return stepResult
      }

      // 保存步骤结果
      processContext.stepResults[step.id] = stepResult
      this.fiveStepProcess.currentStepResult = stepResult

      return {
        content: stepResult.summary || '步骤执行完成',
        details: stepResult,
        isLastStep: stepIndex === processContext.stepPlan.length - 1,
        currentStepIndex: stepIndex
      }
    } catch (error) {
      return this._handleError(error, ERROR_TYPES.LLM_ERROR)
    }
  }

  /**
   * 生成五步问题解决流程的详细计划
   */
  async _generateFiveStepPlan(userMessage, gameContext) {
    const prompt = `
你需要将用户的问题分解为五步问题解决流程：
1. 明确任务 - 理解和澄清用户请求
2. 感知环境 - 收集相关信息和上下文
3. 思考规划 - 制定解决方案和执行计划
4. 执行行动 - 按照计划执行具体操作
5. 观察迭代 - 评估结果并根据需要调整

用户问题: ${userMessage}

请为这个问题生成详细的五步解决计划，每个步骤需要包含：
- id: 步骤标识符（task_clarification, environment_perception, planning, execution, observation）
- name: 步骤名称
- description: 步骤的详细描述
- objectives: 该步骤需要完成的具体目标（数组）
- expectedOutput: 预期输出结果

请用JSON格式输出，确保格式正确，不要包含任何其他文本。
格式要求：
{"steps": [步骤1对象, 步骤2对象, 步骤3对象, 步骤4对象, 步骤5对象]}
`

    const response = await ai.sendLLMMessage(prompt, gameContext)
    if (response.error) {
      return {error: response.error}
    }

    try {
      const parsedResponse =
        typeof response === 'object' ? response : JSON.parse(response)
      return parsedResponse
    } catch (error) {
      return {error: `解析流程计划失败: ${error.message}`}
    }
  }

  /**
   * 格式化流程计划为可读文本
   */
  _formatProcessPlan(steps) {
    if (!steps || !Array.isArray(steps)) {
      return {text: '无法生成五步流程计划'}
    }

    let formatted = '我将按以下五步来解决您的问题：\n\n'

    steps.forEach((step, index) => {
      formatted += `${index + 1}. ${step.name} - ${step.description}\n`
      formatted += `   目标：\n`
      step.objectives?.forEach(obj => {
        formatted += `   - ${obj}\n`
      })
      formatted += `   预期输出：${step.expectedOutput}\n\n`
    })

    formatted += '请确认是否按照这个计划开始执行'
    return {
      text: formatted,
      button: {
        text: '开始执行',
        action: 'continueFiveStepProcess',
        nextStepIndex: 0
      }
    }
  }

  /**
   * 执行任务澄清步骤
   */
  async _executeTaskClarification(step, processContext) {
    const prompt = `
任务：${processContext.userMessage}

请按照以下步骤明确任务：
1. 分析用户的核心需求
2. 识别问题的边界和范围
3. 澄清任何可能的歧义或假设
4. 定义成功标准

输出要求：
- summary: 对任务的清晰理解（1-2句话）
- details: 详细的任务分析
- ambiguities: 需要澄清的地方（如果有）
- successCriteria: 成功完成任务的标准
`

    const response = await ai.sendLLMMessage(prompt, processContext.gameContext)
    if (response.error) {
      return {error: response.error}
    }

    return this._parseStepResponse(response)
  }

  /**
   * 执行环境感知步骤
   */
  async _executeEnvironmentPerception(step, processContext) {
    // 获取棋盘上下文
    const boardContext = await this.getBoardContext(processContext.gameContext)

    // 获取可用的MCP工具列表
    const toolsListJson = mcpHelper.getAvailableEndpoints()

    const prompt = `
任务：${processContext.userMessage}

棋盘上下文：${boardContext || '无可用棋盘信息'}

可用工具列表：${JSON.stringify(toolsListJson, null, 2)}

请按照以下步骤感知环境：
1. 分析当前棋盘状态（如果有）
2. 识别相关的上下文信息
3. 收集解决问题所需的信息
4. 评估信息的完整性
5. 考虑是否可以使用可用工具获取更多信息

输出要求：
- summary: 环境分析摘要（1-2句话）
- details: 详细的环境分析
- relevantInformation: 相关信息列表
- informationGaps: 信息缺口（如果有）
- recommendedTools: 建议使用的工具（如果需要获取更多信息）
`

    const response = await ai.sendLLMMessage(prompt, processContext.gameContext)
    if (response.error) {
      return {error: response.error}
    }

    return this._parseStepResponse(response)
  }

  /**
   * 执行思考规划步骤
   */
  async _executePlanning(step, processContext) {
    // 获取MCP工具列表
    let toolsListJson = '[]'
    let toolsInfo = ''
    // if (this.toolConfig.toolUsageEnabled) {
    //   toolsListJson = this.formatToolsList(true, false, true)
    //   toolsInfo = `\n\n可用工具列表:\n${JSON.stringify(
    //     toolsListJson,
    //     null,
    //     2
    //   )}\n`
    // }

    const prompt = `
任务：${processContext.userMessage}

任务澄清结果：${JSON.stringify(
      processContext.stepResults.task_clarification || {}
    )}

环境感知结果：${JSON.stringify(
      processContext.stepResults.environment_perception || {}
    )}${toolsInfo}

请按照以下步骤制定解决方案：
1. 基于任务和环境分析提出解决思路
2. 设计具体的执行步骤和方法${
      this.toolConfig.toolUsageEnabled ? '，包括可能需要使用的工具' : ''
    }
3. 评估可能的风险和替代方案
4. 制定详细的行动计划${
      this.toolConfig.toolUsageEnabled
        ? '，对于需要调用工具的步骤，请明确指定工具名称和参数'
        : ''
    }

输出要求：
- summary: 解决方案摘要（1-2句话）
- details: 详细的解决方案
- executionSteps: 具体执行步骤列表${
      this.toolConfig.toolUsageEnabled ? '，包含可能的toolCall对象' : ''
    }
- potentialRisks: 潜在风险及应对措施
`

    const response = await ai.sendLLMMessage(prompt, processContext.gameContext)
    if (response.error) {
      return {error: response.error}
    }

    return this._parseStepResponse(response)
  }

  /**
   * 执行执行行动步骤
   */
  async _executeActions(processContext) {
    const planningResult = processContext.stepResults.planning.details
    if (!planningResult || !planningResult.executionSteps) {
      return {error: '缺少执行步骤计划'}
    }

    // 执行步骤中可能涉及的工具调用
    const executedActions = []
    const toolResults = []
    let allResults = ''

    // 遍历执行步骤，检查是否需要调用工具
    for (const actionStep of planningResult.executionSteps) {
      executedActions.push(actionStep)
      if (!actionStep.toolCall) continue
      // 检查步骤是否包含工具调用信息
      const toolCall = actionStep.toolCall.mcp.tool
      if (toolCall) {
        try {
          // 执行工具调用
          const toolResult = await this._executeTool(toolCall)

          // 保存工具调用结果
          toolResults.push({
            toolName: toolCall.name,
            parameters: toolCall.parameters,
            result: toolResult
          })

          // 添加到结果汇总
          const result = toolResult.toolResult
          if (result.data || result.content) {
            const resultContent = JSON.stringify(
              result.data || result.content,
              null,
              2
            )
            allResults += `工具 ${toolCall.name} 的结果:\n${resultContent}\n\n`
          }
        } catch (error) {
          // 记录错误但继续执行其他步骤
          toolResults.push({
            toolName: toolCall.name,
            parameters: toolCall.parameters,
            error: error.message
          })
          allResults += `工具 ${toolCall.name} 执行失败: ${error.message}\n\n`
        }
      } else if (actionStep.description) {
        // 对于没有工具调用的步骤，直接使用描述
        allResults += `${actionStep.description}\n\n`
      }
    }

    // 也检查是否有其他步骤中产生的工具结果
    const previousSteps = ['task_clarification', 'environment_perception']
    const allToolResultsFromHistory = []

    previousSteps.forEach(stepId => {
      if (
        processContext.stepResults[stepId] &&
        processContext.stepResults[stepId].toolResults
      ) {
        allToolResultsFromHistory.push(
          ...processContext.stepResults[stepId].toolResults
        )
      }
    })

    // 构建最终返回结果，确保包含所有工具调用结果
    return {
      summary: '已按照计划执行操作并获得结果',
      details: '执行了计划中的步骤并获取了工具调用结果',
      executedActions: executedActions,
      toolResults: [...toolResults, ...allToolResultsFromHistory],
      results: allResults || '操作执行成功，获得了预期结果',
      // 添加所有可能的工具调用结果，确保前端能够显示
      allToolResults: [...toolResults, ...allToolResultsFromHistory]
    }
  }

  /**
   * 执行观察迭代步骤
   */
  async _executeObservation(step, processContext) {
    const prompt = `
任务：${processContext.userMessage}

执行结果：${JSON.stringify(processContext.stepResults.execution || {})}

请按照以下步骤评估结果：
1. 分析执行结果与预期目标的符合度
2. 识别成功和不足之处
3. 提供改进建议
4. 总结整个问题解决过程

输出要求：
- summary: 结果评估摘要（1-2句话）
- details: 详细的结果评估
- achievements: 完成的成就
- improvements: 改进建议
- finalConclusion: 最终结论
`

    const response = await ai.sendLLMMessage(prompt, processContext.gameContext)
    if (response.error) {
      return {error: response.error}
    }

    return this._parseStepResponse(response)
  }

  /**
   * 解析步骤响应
   */
  _parseStepResponse(response) {
    try {
      let parsedResponse
      if (typeof response === 'object') {
        parsedResponse = response
      } else {
        parsedResponse = JSON.parse(response)
      }

      // 确保返回格式包含必要的字段
      const result = {
        summary:
          parsedResponse.summary || parsedResponse.content || parsedResponse,
        details: {}
      }

      // 将所有其他字段添加到details对象中
      Object.keys(parsedResponse).forEach(key => {
        if (key !== 'summary') {
          result.details[key] = parsedResponse[key]
        }
      })

      return result
    } catch (error) {
      // 如果无法解析JSON，构建包含summary和details的标准响应
      return {
        summary: String(response),
        details: {
          rawResponse: String(response),
          note: '响应格式不是有效的JSON'
        }
      }
    }
  }

  async _loop() {
    while (this.agentState.isRunning) {
      if (this.agentState.executionCount >= this.agentState.maxSteps) {
        const error = new Error(
          `Maximum execution steps (${this.agentState.maxSteps}) reached`
        )
        this._handleError(error, ERROR_TYPES.TIMEOUT_ERROR)
        return {error: error.message}
      }

      if (this._checkTimeout()) {
        const error = new Error(
          `Execution timed out after ${this.agentState.timeout}ms`
        )
        this._handleError(error, ERROR_TYPES.TIMEOUT_ERROR)
        return {error: error.message}
      }

      this.agentState.executionCount++
      let thoughtResult, actionResult, observation

      // 如果启用了自进化功能，在思考前进行能力缺口检测
      if (this.toolConfig.selfEvolvingEnabled && this.agentState.executionCount === 1) {
        const currentTask = this.agentState.conversationContext?.initialMessage || ''
        const capabilityGaps = await this._detectCapabilityGaps(currentTask)
        
        // 如果检测到能力缺口，触发通知
        if (capabilityGaps && capabilityGaps.hasGap) {
          this._triggerCapabilityGap(capabilityGaps)
          
          // 暂停执行，等待用户可能添加的新工具
          // 注意：这里我们让执行继续，但用户可以在工具被注册后通过新的交互来继续
        }
      }

      thoughtResult = await this._executeWithTimeout(
        this._think.bind(this),
        60000
      )

      if (thoughtResult.error) {
        if (this._shouldRetry()) {
          continue
        }
        return {error: thoughtResult.error}
      }

      actionResult = await this._executeWithTimeout(
        () => this._act(thoughtResult),
        120000
      )

      if (actionResult.error) {
        if (this._shouldRetry()) {
          continue
        }
        return {error: actionResult.error}
      }

      observation = await this._executeWithTimeout(
        () => this._observe(actionResult),
        30000
      )

      // 在观察阶段，如果启用了自进化功能，根据执行结果再次检查能力缺口
      if (this.toolConfig.selfEvolvingEnabled && observation.suggestCapabilityGaps) {
        const capabilityGaps = await this._detectCapabilityGaps(observation.suggestCapabilityGaps)
        
        if (capabilityGaps && capabilityGaps.hasGap) {
          this._triggerCapabilityGap(capabilityGaps)
        }
      }

      if (observation.shouldTerminate || !actionResult.shouldContinue) {
        return this._summarize(observation)
      }
    }

    return {error: 'Agent execution stopped'}
  }

  async _executeWithTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      fn().then(
        result => {
          clearTimeout(timeoutId)
          resolve(result)
        },
        error => {
          clearTimeout(timeoutId)
          reject(error)
        }
      )
    })
  }

  _shouldRetry() {
    if (this.agentState.retryCount < this.agentState.maxRetries) {
      this.agentState.retryCount++
      console.warn(
        `Retrying operation... Attempt ${this.agentState.retryCount}/${this.agentState.maxRetries}`
      )
      return true
    }
    return false
  }

  async _think() {
    this._emitStateChange(AGENT_STATES.THINKING)

    const thoughtPrompt = await this._buildThoughtPrompt()
    let thoughtResponse
    try {
      thoughtResponse = await ai.sendLLMMessage(
        thoughtPrompt,
        this.agentState.conversationContext.gameContext
      )
    } catch (error) {
      sabaki.aiManager.openApiKeyManager()
      this.agentState.isRunning = false
      this._emitStateChange(AGENT_STATES.IDLE)
      // 不再抛出错误，而是返回错误信息对象
      return {error: error.message || String(error)}
    }
    if (!thoughtResponse || thoughtResponse.error) {
      this.agentState.isRunning = false
      this._emitStateChange(AGENT_STATES.IDLE)
      // 不再抛出错误，而是返回错误信息对象
      return {error: thoughtResponse?.error || 'Failed to get LLM response'}
    }

    const thoughtResult = this._parseThoughtResponse(thoughtResponse)
    
    // 如果启用了自进化功能，检查思考结果中是否提到了需要但不存在的工具
    if (this.toolConfig.selfEvolvingEnabled) {
      const thoughtText = JSON.stringify(thoughtResult)
      const potentialGaps = await this._detectCapabilityGaps(thoughtText)
      
      if (potentialGaps && potentialGaps.hasGap) {
        this._triggerCapabilityGap(potentialGaps)
      }
    }

    this.agentState.history.push({
      type: 'thought',
      content: thoughtResult,
      timestamp: Date.now(),
      executionStep: this.agentState.executionCount
    })

    return thoughtResult
  }

  async _act(thoughtResult) {
    this._emitStateChange(AGENT_STATES.ACTING)

    if (!thoughtResult || typeof thoughtResult !== 'object') {
      throw new Error('Invalid thought result format')
    }

    let actionResult = {shouldContinue: true}

    switch (thoughtResult.action) {
      case 'tool_call':
        if (!thoughtResult.tool || !thoughtResult.tool.name) {
          throw new Error('Invalid tool information')
        }
        actionResult = await this._executeTool(thoughtResult.tool)
        break

      case 'respond':
        actionResult = {
          shouldContinue: false,
          result: {content: thoughtResult.content || 'No response content'}
        }
        break

      case 'ask_clarification':
        actionResult = {
          shouldContinue: false,
          result: {
            content: thoughtResult.content || '需要更多信息',
            needsClarification: true
          }
        }
        break

      default:
        actionResult = {
          shouldContinue: false,
          result: {
            content: thoughtResult.content || '抱歉，我无法理解您的问题'
          }
        }
    }

    this.agentState.lastActionResult = actionResult
    return actionResult
  }

  async _observe(actionResult) {
    this._emitStateChange(AGENT_STATES.OBSERVING)

    if (!actionResult || typeof actionResult !== 'object') {
      throw new Error('Invalid action result format')
    }

    if (actionResult.error) {
      return {
        shouldTerminate: true,
        result: {error: actionResult.error}
      }
    }

    if (!actionResult.shouldContinue) {
      return {
        shouldTerminate: true,
        result: actionResult.result || {content: 'Operation completed'}
      }
    }

    if (actionResult.toolResult) {
      this.agentState.history.push({
        type: 'tool_result',
        content: actionResult.toolResult,
        timestamp: Date.now(),
        executionStep: this.agentState.executionCount
      })

      this.agentState.conversationContext.lastToolResult =
        actionResult.toolResult

      this.agentState.retryCount = 0
      
      // 如果启用了自进化功能，基于工具执行结果检查潜在能力缺口
      if (this.toolConfig.selfEvolvingEnabled) {
        const toolResultText = JSON.stringify(actionResult.toolResult)
        const potentialGaps = await this._detectCapabilityGaps(toolResultText)
        
        if (potentialGaps && potentialGaps.hasGap) {
          this._triggerCapabilityGap(potentialGaps)
        }
      }

      return {
        shouldTerminate: false,
        context: actionResult.toolResult
      }
    }

    return {
      shouldTerminate: true,
      result: {error: 'Unknown observation state'}
    }
  }

  async _executeTool(toolInfo) {
    // 兼容直接传递工具信息和嵌套在mcp.tool中的两种格式
    const info = {
      type: 'tool_call',
      content: toolInfo,
      timestamp: Date.now(),
      ...toolInfo
    }
    this.agentState.history.push(info)

    const validatedToolInfo = this._validateToolParameters(info)

    // 获取gameContext，添加空值检查
    const gameContext = this.agentState.conversationContext?.gameContext || null

    // 根据工具类型执行不同的逻辑
    let toolResult

    try {
      switch (validatedToolInfo.type) {
        case TOOL_TYPES.INFO_RETRIEVAL:
        case TOOL_TYPES.EXECUTION:
          // 信息检索和执行工具的特殊处理逻辑
          console.log(`执行信息检索/执行工具: ${validatedToolInfo.name}`)
          toolResult = await this._executeBuiltinTool(validatedToolInfo)
          break

        case TOOL_TYPES.SYSTEM_INTEGRATION:
          // 系统/API集成工具的特殊处理逻辑
          console.log(`执行系统/API集成工具: ${validatedToolInfo.name}`)
          toolResult = await mcpHelper.handleMCPRequest(
            {
              mcp: {
                tool: validatedToolInfo
              }
            },
            gameContext
          )
          break

        case TOOL_TYPES.HUMAN_COLLABORATION:
          // 人机协作工具的特殊处理逻辑
          console.log(`执行人机协作工具: ${validatedToolInfo.name}`)
          toolResult = await this._executeAgentTool(validatedToolInfo)
          break

        default:
          // 未指定类型的工具默认使用系统/API集成工具处理流程
          console.log(`执行默认工具: ${validatedToolInfo.name}`)
          toolResult = await mcpHelper.handleMCPRequest(
            {
              mcp: {
                tool: validatedToolInfo
              }
            },
            gameContext
          )
          break
      }
    } catch (error) {
      // 捕获所有未处理的异常，转换为工具操作错误格式
      console.error(`工具执行异常 - ${validatedToolInfo.name}:`, error)
      toolResult = {
        isError: true,
        error: `工具执行失败: ${error.message}`,
        message: `执行工具"${validatedToolInfo.name}"时发生内部错误`
      }
    }

    return this._processToolResult(toolResult, validatedToolInfo.name)
  }

  // 执行内置工具的方法
  async _executeBuiltinTool(toolInfo) {
    // 获取gameContext，添加空值检查
    const gameContext = this.agentState.conversationContext?.gameContext || null
    // 内置工具默认也走MCP请求流程，可以在这里添加特定的内置工具处理
    return await mcpHelper.handleMCPRequest(
      {
        mcp: {
          tool: toolInfo
        }
      },
      gameContext
    )
  }

  // 执行智能体工具的方法
  async _executeAgentTool(toolInfo) {
    // 获取gameContext，添加空值检查
    const gameContext = this.agentState.conversationContext?.gameContext || null

    // 如果启用了人机协作，将配置传递给工具参数
    if (this.humanCollaborationEnabled) {
      if (!toolInfo.parameters) {
        toolInfo.parameters = {}
      }
      toolInfo.parameters.humanCollaborationRequired = true
    }

    // 智能体工具默认也走MCP请求流程，可以在这里添加特定的智能体工具处理
    return await mcpHelper.handleMCPRequest(
      {
        mcp: {
          tool: toolInfo
        }
      },
      this.agentState.conversationContext.gameContext
    )
  }

  // 设置人机协作开关
  setHumanCollaborationEnabled(enabled) {
    this.humanCollaborationEnabled = enabled
    // 确保AIHelper也使用相同的设置
    if (typeof ai.setHumanCollaborationEnabled === 'function') {
      ai.setHumanCollaborationEnabled(enabled)
    }
  }

  /**
   * 设置是否启用工具使用
   */
  setToolUsageEnabled(enabled) {
    this.toolConfig.toolUsageEnabled = enabled
  }

  /**
   * 设置是否启用规划能力
   */
  setPlanningEnabled(enabled) {
    this.toolConfig.planningEnabled = enabled
  }

  /**
   * 设置是否启用多智能体协作
   */
  // 注册默认主智能体
  _registerMainAgent() {
    // 创建主智能体实例
    const mainAgent = new Agent(
      this.defaultAgentId,
      '主智能体',
      'main',
      '系统主要智能体，负责协调其他智能体和处理用户请求'
    )
    mainAgent.addCapability('任务分析')
    mainAgent.addCapability('智能体协调')
    mainAgent.addCapability('用户交互')

    // 重写execute方法，使用AI模块与LLM交互
    mainAgent.execute = async params => {
      this.setState(AGENT_STATES.ACTING)
      
      try {
        // 构建LLM请求参数
        const llmParams = {
          query: params.query || '',
          task: params.task || 'general',
          context: {
            availableAgents: params.availableAgents || [],
            conversationHistory: this.agentState.history,
            boardContext: this.toolConfig.includeBoardContext ? await this._getBoardContext() : null
          }
        }
        
        // 调用AI模块处理请求
        const llmResponse = await ai.sendLLMMessage(llmParams.query, sabaki.state)
        
        return {
          success: true,
          content: llmResponse || '任务已处理',
          agentId: mainAgent.id,
          agentName: mainAgent.name
        }
      } catch (error) {
        console.error('主智能体执行失败:', error)
        return {
          success: false,
          content: '处理请求时出现错误',
          error: error.message,
          agentId: mainAgent.id,
          agentName: mainAgent.name
        }
      }
    }

    this.addAgent(mainAgent)
    return mainAgent
  }

  // 获取棋盘上下文信息
  async _getBoardContext() {
    try {
      if (!sabaki || !sabaki.state) return null
      
      const {gameTrees, gameIndex, treePosition} = sabaki.state
      if (!gameTrees[gameIndex]) return null
      
      // 获取当前棋盘状态
      const board = gametree.getBoard(gameTrees[gameIndex], treePosition)
      
      // 限制上下文长度
      const boardContext = {
        boardSize: board ? board.width : 19,
        currentMove: treePosition.length,
        gameInfo: gametree.getGameInfo(gameTrees[gameIndex]),
        transformation: sabaki.state.gobanTransformation || ''
      }
      
      return boardContext
    } catch (error) {
      console.error('获取棋盘上下文失败:', error)
      return null
    }
  }

  // 添加智能体
  addAgent(agent) {
    if (agent && agent.id && agent instanceof Agent) {
      this.agents[agent.id] = agent
      console.log(`智能体已添加: ${agent.name} (${agent.id})`)
      return true
    }
    return false
  }

  // 移除智能体
  removeAgent(agentId) {
    if (this.agents[agentId]) {
      delete this.agents[agentId]
      console.log(`智能体已移除: ${agentId}`)
      return true
    }
    return false
  }

  // 获取智能体
  getAgent(agentId) {
    return this.agents[agentId] || null
  }

  // 获取所有智能体
  getAllAgents() {
    return Object.values(this.agents)
  }

  // 获取智能体信息列表
  getAgentsInfo() {
    return Object.values(this.agents).map(agent => agent.getInfo())
  }

  // 向智能体发送消息（用于智能体间通信）
  async sendMessageToAgent(fromAgentId, toAgentId, message, params = {}) {
    const targetAgent = this.getAgent(toAgentId)
    if (!targetAgent || !targetAgent.isAvailable) {
      return {
        success: false,
        error: `智能体${toAgentId}不可用`
      }
    }

    // 记录交互历史
    this.agentInteractions.push({
      from: fromAgentId,
      to: toAgentId,
      message,
      timestamp: Date.now()
    })

    try {
      // 调用目标智能体的execute方法
      const result = await targetAgent.execute({
        ...params,
        message,
        sender: fromAgentId
      })

      return result
    } catch (error) {
      return {
        success: false,
        error: error.message || '智能体通信失败'
      }
    }
  }

  // 根据能力查找合适的智能体
  findAgentByCapability(capability) {
    for (const agent of Object.values(this.agents)) {
      if (agent.isAvailable && agent.hasCapability(capability)) {
        return agent
      }
    }
    return null
  }

  // 设置是否启用多智能体协作
  setMultiAgentEnabled(enabled) {
    this.toolConfig.multiAgentEnabled = enabled
    console.log(`多智能体协作已${enabled ? '启用' : '禁用'}`)
  }

  /**
   * 设置是否启用自进化能力
   */
  setSelfEvolvingEnabled(enabled) {
    this.toolConfig.selfEvolvingEnabled = enabled
  }

  _validateToolParameters(toolInfo) {
    const validatedParams = {...toolInfo}
    const availableTools = this.getAvailableTools()
    const tool = availableTools.find(e => e.name === toolInfo.name)

    if (tool) {
      // 保留工具类型信息
      validatedParams.type = tool.type

      if (tool.parameters) {
        if (!validatedParams.parameters) {
          validatedParams.parameters = {}
        }

        if (tool.parameters.properties) {
          Object.keys(tool.parameters.properties).forEach(key => {
            const prop = tool.parameters.properties[key]
            if (
              prop.default !== undefined &&
              validatedParams.parameters[key] === undefined
            ) {
              validatedParams.parameters[key] = prop.default
            }
          })
        }
      }
    }

    return validatedParams
  }

  _processToolResult(toolResult, toolName) {
    // 处理JSON-RPC格式的错误
    if (toolResult.jsonrpc === '2.0' && toolResult.error) {
      return {
        shouldContinue: false,
        error: toolResult.error.data || toolResult.error.message
      }
    }

    // 处理传统的error字段
    if (toolResult.error) {
      return {
        shouldContinue: false,
        error: toolResult.error
      }
    }

    // 处理工具操作中产生的错误（isError字段）
    if (toolResult.isError === true) {
      return {
        shouldContinue: false,
        error: toolResult.error || toolResult.message || '工具操作失败'
      }
    }

    // 如果指定了工具名称，尝试验证结果是否符合outputSchema
    if (toolName) {
      const availableTools = this.getAvailableTools()
      const tool = availableTools.find(t => t.name === toolName)

      if (tool && tool.outputSchema) {
        // 基本验证：检查是否包含必要的字段
        if (
          tool.outputSchema.required &&
          Array.isArray(tool.outputSchema.required)
        ) {
          const missingFields = tool.outputSchema.required.filter(
            field => !toolResult.hasOwnProperty(field)
          )
          if (missingFields.length > 0) {
            console.warn(
              `工具${toolName}的结果缺少必要字段: ${missingFields.join(', ')}`
            )
            // 这里只警告，不阻止返回结果，保持向后兼容性
          }
        }
      }
    }

    return {
      shouldContinue: true,
      toolResult: toolResult
    }
  }

  // 根据工具类型获取可用工具
  getAvailableTools(toolType = null) {
    if (!this.toolConfig.toolUsageEnabled) {
      return []
    }
    const endpoints = mcpHelper.getAvailableEndpoints()

    // 确保每个工具都有类型标识，如果没有则默认为函数工具
    const toolsWithType = endpoints.map(tool => ({
      ...tool,
      type: tool.type || TOOL_TYPES.EXECUTION
    }))

    // 如果指定了工具类型，则过滤返回对应类型的工具
    if (toolType && Object.values(TOOL_TYPES).includes(toolType)) {
      return toolsWithType.filter(tool => tool.type === toolType)
    }

    return toolsWithType
  }

  // 获取按类型分组的工具
  getToolsByType() {
    const tools = this.getAvailableTools()
    const grouped = {
      [TOOL_TYPES.INFO_RETRIEVAL]: [],
      [TOOL_TYPES.EXECUTION]: [],
      [TOOL_TYPES.SYSTEM_INTEGRATION]: [],
      [TOOL_TYPES.HUMAN_COLLABORATION]: []
    }

    tools.forEach(tool => {
      if (grouped.hasOwnProperty(tool.type)) {
        grouped[tool.type].push(tool)
      } else {
        // 未知类型默认为函数工具
        grouped[tool.type].push(tool)
      }
    })

    return grouped
  }

  getCurrentProvider() {
    return getSelectedServiceProvider()
  }

  /**
   * 设置工具配置
   */
  setToolConfig(config) {
    if (config && typeof config === 'object') {
      this.toolConfig = {
        ...this.toolConfig,
        ...config
      }
    }
  }

  /**
   * 获取工具配置
   */
  getToolConfig() {
    return {...this.toolConfig}
  }

  /**
   * 获取boardContext数据
   * 根据配置决定是否返回boardContext
   */
  async getBoardContext(gameContext) {
    if (!this.toolConfig.includeBoardContext) {
      return ''
    }

    const result = await mcpHelper.handleMCPRequest(
      {
        mcp: {
          tool: {
            name: '获取棋盘上下文',
            parameters: {includeFullHistory: true}
          }
        }
      },
      gameContext
    )

    if (result.success && result.data && result.data.boardContext) {
      let boardContext = result.data.boardContext

      // 如果设置了最大长度限制，并且boardContext超过了这个限制，则截断
      if (
        this.toolConfig.boardContextMaxLength > 0 &&
        boardContext.length > this.toolConfig.boardContextMaxLength
      ) {
        boardContext =
          boardContext.substring(0, this.toolConfig.boardContextMaxLength) +
          '...'
      }

      return boardContext
    }

    return ''
  }

  // MCP协议要求始终使用JSON格式的工具列表，包含outputSchema
  formatToolsList(detailed = false, includePrefix = false, grouped = true) {
    const availableTools = this.getAvailableTools()

    // 按类型分组返回JSON格式
    if (grouped) {
      const toolsByType = {}
      availableTools.forEach(tool => {
        if (!toolsByType[tool.type]) {
          toolsByType[tool.type] = []
        }
        toolsByType[tool.type].push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || {},
          outputSchema: tool.outputSchema || {}
        })
      })
      return toolsByType
    }

    // 不分组返回JSON格式
    return availableTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || {},
      outputSchema: tool.outputSchema || {}
    }))
  }

  // 获取工具类型的中文名称
  _getToolTypeName(type) {
    const typeNames = {
      [TOOL_TYPES.INFO_RETRIEVAL]: '信息检索',
      [TOOL_TYPES.EXECUTION]: '执行',
      [TOOL_TYPES.SYSTEM_INTEGRATION]: '集成',
      [TOOL_TYPES.HUMAN_COLLABORATION]: '协作'
    }
    return typeNames[type] || '函数'
  }

  // 获取单个工具的详细信息
  getToolDetails(toolName) {
    const availableTools = this.getAvailableTools()
    const tool = availableTools.find(t => t.name === toolName)

    if (!tool) {
      return null
    }

    return `
  - 工具名称: ${tool.name}
    类型: ${this._getToolTypeName(tool.type)}
    描述: ${tool.description}
    参数要求: ${
      tool.parameters ? this._formatParameters(tool.parameters) : '无'
    }`
  }

  _formatParameters(parameters) {
    let result = []

    if (parameters.required && parameters.required.length > 0) {
      result.push(`必填参数: ${parameters.required.join(', ')}`)
    }

    if (parameters.properties) {
      let propsInfo = []
      for (const [name, param] of Object.entries(parameters.properties)) {
        let propDesc = `${name}`
        if (param.type) propDesc += ` (${param.type})`
        if (param.description) propDesc += ` - ${param.description}`
        if (param.default !== undefined) {
          propDesc += ` [默认: ${JSON.stringify(param.default)}]`
        }
        propsInfo.push(propDesc)
      }
      if (propsInfo.length > 0) {
        result.push(`可选参数: ${propsInfo.join(', ')}`)
      }
    }

    return result.join('; ')
  }

  async _analyzeThought(boardContext) {
    return this.thoughtProcessHandlers.analyze(boardContext)
  }

  async _planThought(analysis) {
    return this.thoughtProcessHandlers.plan(analysis)
  }

  async _decideThought(plan) {
    return this.thoughtProcessHandlers.decide(plan)
  }

  async _buildThoughtPrompt() {
    // MCP协议要求使用JSON格式的工具列表
    let toolsListJson = '[]'
    if (this.toolConfig.toolUsageEnabled) {
      toolsListJson = this.formatToolsList(true, false, true)
    }
    const {lastToolResult} = this.agentState.conversationContext || {}

    // 获取用户历史消息
    const userMessages = this.agentState.history.filter(
      item => item.type === 'user'
    )

    // 使用promptManager构建决策提示
    return await promptManager.buildDecisionPrompt(
      toolsListJson,
      userMessages,
      lastToolResult
    )
  }

  _parseThoughtResponse(response) {
    let parsedResponse

    if (typeof response === 'object') {
      parsedResponse = response
    } else {
      try {
        parsedResponse = JSON.parse(response)
      } catch (parseError) {
        throw new Error(`无法解析LLM响应: ${parseError.message}`)
      }
    }

    if (!parsedResponse.action) {
      throw new Error('LLM响应缺少action字段')
    }

    return parsedResponse
  }

  _summarize(observation) {
    if (!observation.result) {
      observation.result = {content: '操作已完成'}
    }

    return observation.result
  }

  reset() {
    this.agentState = {
      currentStep: AGENT_STATES.IDLE,
      history: [],
      conversationContext: null,
      lastActionResult: null,
      isRunning: false,
      error: null,
      executionCount: 0,
      maxSteps: 20,
      startTime: null,
      timeout: 300000,
      retryCount: 0,
      maxRetries: 3
    }

    this._emitStateChange(AGENT_STATES.IDLE)
  }

  // 多智能体协作执行方法
  async runMultiAgent(params = {}) {
    // 设置状态
    this._emitStateChange(AGENT_STATES.THINKING)

    // 获取所有可用智能体
    const availableAgents = this.getAllAgents().filter(
      agent => agent.isAvailable
    )

    // 如果没有可用智能体，返回错误
    if (availableAgents.length === 0) {
      this.agentState.error = '没有可用的智能体'
      this._emitStateChange(AGENT_STATES.ERROR)
      return {
        success: false,
        error: '没有可用的智能体'
      }
    }

    // 主智能体作为协调者
    const mainAgent = this.getAgent(this.defaultAgentId)
    if (!mainAgent) {
      this.agentState.error = '主智能体未找到'
      this._emitStateChange(AGENT_STATES.ERROR)
      return {
        success: false,
        error: '主智能体未找到'
      }
    }

    try {
      // 由主智能体分析任务并分配
      const analysisResult = await mainAgent.execute({
        ...params,
        task: 'analyze_and_plan',
        availableAgents: this.getAgentsInfo()
      })

      // 根据任务性质查找合适的智能体
      let taskAgent = mainAgent
      const query = params.query || ''

      // 判断是否需要Golaxy直播报告智能体
      if (
        query.includes('直播') ||
        query.includes('比赛') ||
        query.includes('Golaxy')
      ) {
        taskAgent = this.findAgentByCapability('获取直播数据') || taskAgent
      }

      this._emitStateChange(AGENT_STATES.ACTING)

      // 执行任务
      const result = await taskAgent.execute(params)

      // 记录执行历史
      this.agentState.history.push({
        agentId: taskAgent.id,
        agentName: taskAgent.name,
        action: 'execute',
        result,
        timestamp: Date.now()
      })

      this._emitStateChange(AGENT_STATES.IDLE)

      // 返回带有智能体信息的结果
      return {
        ...result,
        success: true,
        agentId: taskAgent.id,
        agentName: taskAgent.name,
        协作模式: '多智能体'
      }
    } catch (error) {
      this.agentState.error = error.message
      this._emitStateChange(AGENT_STATES.ERROR)
      return {
        success: false,
        error: error.message,
        state: this.getStats()
      }
    }
  }

  stop() {
    this.agentState.isRunning = false
    this._emitStateChange(AGENT_STATES.PAUSED)
  }

  pause() {
    this.agentState.isRunning = false
    this._emitStateChange(AGENT_STATES.PAUSED)
  }

  resume() {
    if (!this.agentState.isRunning) {
      this.agentState.isRunning = true
      this._loop()
    }
  }

  /**
   * 获取执行统计信息
   */
  getStats() {
    const currentTime = Date.now()
    const elapsedTime = this.agentState.startTime
      ? currentTime - this.agentState.startTime
      : 0
    const remainingSteps =
      this.agentState.maxSteps - this.agentState.executionCount

    return {
      currentStep: this.agentState.currentStep,
      executionCount: this.agentState.executionCount,
      maxSteps: this.agentState.maxSteps,
      remainingSteps: remainingSteps > 0 ? remainingSteps : 0,
      elapsedTime: Math.floor(elapsedTime / 1000), // 转换为秒
      timeout: this.agentState.timeout,
      retryCount: this.agentState.retryCount,
      maxRetries: this.agentState.maxRetries,
      hasError: !!this.agentState.error,
      error: this.agentState.error,
      // 五步流程相关统计
      isFiveStepProcess: !!this.fiveStepProcess.isProcessRunning,
      fiveStepCurrentStep: this.fiveStepProcess.currentProcessStep,
      fiveStepTotalSteps: this.fiveStepProcess.processSteps.length
    }
  }

  /**
   * 获取五步流程的当前状态
   */
  getFiveStepProcessState() {
    return {
      isRunning: this.fiveStepProcess.isProcessRunning,
      currentStep: this.fiveStepProcess.currentProcessStep,
      steps: this.fiveStepProcess.processSteps,
      processContext: this.fiveStepProcess.processContext
    }
  }

  /**
   * 重置五步流程
   */
  resetFiveStepProcess() {
    this.fiveStepProcess = {
      currentProcessStep: null,
      processSteps: [],
      isProcessRunning: false,
      currentStepResult: null,
      processContext: null
    }
  }
  
  /**
   * 动态注册新工具
   */
  registerNewTool(toolInfo) {
    // 验证工具信息的基本结构
    if (!toolInfo || !toolInfo.name || !toolInfo.description) {
      throw new Error('工具信息不完整，需要包含name和description字段')
    }
    
    // 生成唯一ID（如果没有提供）
    const tool = {
      id: toolInfo.id || `dynamic_tool_${Date.now()}`,
      name: toolInfo.name,
      description: toolInfo.description,
      parameters: toolInfo.parameters || [],
      type: toolInfo.type || TOOL_TYPES.EXECUTION,
      // 添加动态注册标记
      isDynamic: true,
      createdTime: Date.now()
    }
    
    // 注册到MCP helper
    if (mcpHelper && typeof mcpHelper.registerEndpoint === 'function') {
      mcpHelper.registerEndpoint(tool)
      console.log(`动态工具注册成功: ${tool.name} (${tool.id})`)
      return tool
    } else {
      throw new Error('无法注册工具：MCP helper不可用')
    }
  }
  
  /**
   * 移除已注册的动态工具
   */
  unregisterTool(toolId) {
    if (!mcpHelper || !mcpHelper.mcpEndpoints) {
      throw new Error('无法移除工具：MCP helper不可用')
    }
    
    const initialLength = mcpHelper.mcpEndpoints.length
    mcpHelper.mcpEndpoints = mcpHelper.mcpEndpoints.filter(
      endpoint => endpoint.id !== toolId
    )
    
    const removed = initialLength !== mcpHelper.mcpEndpoints.length
    if (removed) {
      console.log(`工具已移除: ${toolId}`)
    }
    
    return removed
  }
  
  /**
   * 获取所有动态注册的工具
   */
  getDynamicTools() {
    if (!mcpHelper || !mcpHelper.mcpEndpoints) {
      return []
    }
    
    return mcpHelper.mcpEndpoints.filter(endpoint => endpoint.isDynamic)
  }
  
  /**
   * 设置自进化功能测试监听器
   */
  _setupEvolvingTestListeners() {
    this.addCapabilityGapListener((gap) => {
      console.log('\n--- 自进化功能测试 - 检测到能力缺口 ---')
      console.log('- hasGap:', gap.hasGap)
      console.log('- gapType:', gap.gapType)
      console.log('- gapName:', gap.gapName)
      console.log('- gapDescription:', gap.gapDescription)
      console.log('- coreFunctions:', gap.coreFunctions)
      console.log('- requiredParameters:', gap.requiredParameters)
      console.log('- reason:', gap.reason)
      console.log('--- 自进化功能测试完毕 ---')
    })
  }
  
  /**
   * 测试自进化系统功能
   * 模拟一个需要特定工具的任务，并验证系统能否正确检测能力缺口
   */
  async testSelfEvolvingCapability() {
    console.log('\n=== 开始自进化系统功能测试 ===')
    
    if (!this.toolConfig.selfEvolvingEnabled) {
      console.log('测试失败: 自进化功能未启用')
      return {success: false, message: '自进化功能未启用'}
    }
    
    try {
      // 1. 测试能力缺口检测
      console.log('测试1: 能力缺口检测...')
      const mockTask = '请使用特定的数据分析工具分析最近一个月的围棋对局数据，找出胜率最高的布局'
      const capabilityGaps = await this._detectCapabilityGaps(mockTask)
      
      console.log('测试1结果:')
      console.log('检测到的能力缺口:', capabilityGaps)
      
      // 2. 测试工具动态注册
      console.log('\n测试2: 动态工具注册...')
      const mockTool = {
        name: '数据分析工具',
        description: '分析围棋对局数据，生成胜率统计和布局分析',
        parameters: [
          {name: 'timeRange', type: 'string', description: '分析时间范围', required: true},
          {name: 'analysisType', type: 'string', description: '分析类型', required: true}
        ]
      }
      
      const registeredTool = this.registerNewTool(mockTool)
      console.log('测试2结果:')
      console.log('工具注册成功:', registeredTool)
      
      // 3. 测试能力获取
      console.log('\n测试3: 可用能力获取...')
      const availableCapabilities = this._getAvailableCapabilities()
      console.log('测试3结果:')
      console.log('获取到的可用能力数量:', availableCapabilities.length)
      
      // 4. 测试再次检测（验证工具注册后缺口是否仍然存在）
      console.log('\n测试4: 再次检测能力缺口...')
      const newGaps = await this._detectCapabilityGaps(mockTask)
      console.log('测试4结果:')
      console.log('新检测到的能力缺口:', newGaps)
      
      // 5. 测试工具移除
      console.log('\n测试5: 工具移除...')
      const removed = this.unregisterTool(registeredTool.id)
      console.log('测试5结果:')
      console.log('工具移除状态:', removed)
      
      console.log('\n=== 自进化系统功能测试完成 ===')
      return {
        success: true,
        message: '所有测试完成',
        results: {
          gapsDetection: !!capabilityGaps,
          toolRegistration: !!registeredTool,
          capabilitiesRetrieval: availableCapabilities.length > 0,
          toolRemoval: removed
        }
      }
    } catch (error) {
      console.error('测试失败:', error)
      return {success: false, message: error.message}
    }
  }
}

export default new AgentOrchestrator()

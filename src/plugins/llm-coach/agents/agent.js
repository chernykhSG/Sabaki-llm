// 智能体基类
export const AGENT_STATES = {
  IDLE: 'idle',
  THINKING: 'thinking',
  ACTING: 'acting',
  OBSERVING: 'observing',
  ERROR: 'error',
  PAUSED: 'paused'
}

export const ERROR_TYPES = {
  LLM_ERROR: 'llm_error',
  TOOL_ERROR: 'tool_error',
  VALIDATION_ERROR: 'validation_error',
  TIMEOUT_ERROR: 'timeout_error',
  UNKNOWN_ERROR: 'unknown_error'
}

// 工具类型常量
export const TOOL_TYPES = {
  // 信息检索类：用于获取和查询系统或外部信息的工具
  INFO_RETRIEVAL: 'info_retrieval',
  // 执行/动作类：执行具体操作或控制的工具
  EXECUTION: 'execution',
  // 系统/API集成类：与其他系统或API进行交互的工具
  SYSTEM_INTEGRATION: 'system_integration',
  // 人机协作类：促进人机交互和协作的工具
  HUMAN_COLLABORATION: 'human_collaboration'
}

export class Agent {
  constructor(id, name, type, description = '') {
    this.id = id;
    this.name = name;
    this.type = type;
    this.description = description;
    this.state = AGENT_STATES.IDLE;
    this.history = [];
    this.isAvailable = true;
    this.capabilities = [];
  }

  // 设置智能体状态
  setState(newState) {
    this.state = newState;
  }

  // 添加历史记录
  addHistory(type, content) {
    this.history.push({
      type,
      content,
      timestamp: Date.now()
    });
  }

  // 设置可用状态
  setAvailable(available) {
    this.isAvailable = available;
  }

  // 添加能力
  addCapability(capability) {
    if (!this.capabilities.includes(capability)) {
      this.capabilities.push(capability);
    }
  }

  // 检查是否拥有某能力
  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  // 智能体执行方法（子类需要实现）
  async execute(params) {
    throw new Error('子类必须实现execute方法');
  }

  // 获取智能体信息
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      state: this.state,
      isAvailable: this.isAvailable,
      capabilities: this.capabilities
    };
  }
}
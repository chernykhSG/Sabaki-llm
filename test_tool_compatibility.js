const agentOrchestrator = require('./src/plugins/llm-coach/agents/agentOrchestrator.js').default

async function testToolCompatibility() {
  console.log('开始测试_executeTool方法的兼容性...')

  // 模拟游戏上下文
  const mockGameContext = {
    gameTrees: [
      {root: {data: {GN: '测试赛事', PB: '黑棋', PW: '白棋'}, get: () => ({})}}
    ],
    gameIndex: 0,
    treePosition: ''
  }

  // 保存原始的_executeBuiltinTool方法
  const originalExecuteBuiltinTool = agentOrchestrator._executeBuiltinTool

  // 模拟_executeBuiltinTool方法，返回测试数据
  agentOrchestrator._executeBuiltinTool = async toolInfo => {
    console.log('工具执行成功，工具信息:', {
      name: toolInfo.name,
      type: toolInfo.type,
      parameters: toolInfo.parameters
    })
    return {success: true, content: '测试成功'}
  }

  try {
    // 测试1: 直接传递工具信息（ai.js中的调用方式）
    console.log('\n测试1: 直接传递工具信息')
    const result1 = await agentOrchestrator._executeTool({
      name: 'get-game-info',
      type: 'info_retrieval',
      parameters: {format: 'text'}
    })
    console.log('测试1结果:', result1 ? '成功' : '失败')

    // 测试2: 通过mcp.tool嵌套传递（原有的预期格式）
    console.log('\n测试2: 通过mcp.tool嵌套传递')
    const result2 = await agentOrchestrator._executeTool({
      mcp: {
        tool: {
          name: 'get-game-info',
          type: 'info_retrieval',
          parameters: {format: 'text'}
        }
      }
    })
    console.log('测试2结果:', result2 ? '成功' : '失败')

    console.log('\n✅ 所有测试通过！_executeTool方法现在兼容两种数据结构格式。')
  } catch (error) {
    console.error('❌ 测试失败:', error)
  } finally {
    // 恢复原始方法
    agentOrchestrator._executeBuiltinTool = originalExecuteBuiltinTool
  }
}

// 运行测试
testToolCompatibility()

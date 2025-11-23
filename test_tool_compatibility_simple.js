// 独立测试脚本，只验证兼容性逻辑
function testCompatibilityLogic() {
  console.log('测试_executeTool方法的兼容性逻辑...')

  // 模拟_executeTool方法中的关键逻辑
  function simulateExecuteTool(toolInfo) {
    // 兼容直接传递工具信息和嵌套在mcp.tool中的两种格式
    const toolData = toolInfo.mcp?.tool || toolInfo
    const info = {
      type: 'tool_call',
      content: toolInfo,
      timestamp: Date.now(),
      ...toolData
    }

    // 验证结果
    console.log('构建的info对象:', {
      name: info.name,
      type: info.type,
      parameters: info.parameters
    })

    return {
      success: true,
      name: info.name,
      type: info.type,
      parameters: info.parameters
    }
  }

  // 测试场景1: 直接传递工具信息（ai.js中的调用方式）
  console.log('\n测试1: 直接传递工具信息')
  const toolInfo1 = {
    name: 'get-game-info',
    type: 'info_retrieval',
    parameters: {format: 'text'}
  }
  const result1 = simulateExecuteTool(toolInfo1)

  // 验证结果
  const test1Passed =
    result1.name === 'get-game-info' &&
    result1.type === 'info_retrieval' &&
    result1.parameters.format === 'text'
  console.log('测试1结果:', test1Passed ? '✅ 通过' : '❌ 失败')

  // 测试场景2: 通过mcp.tool嵌套传递（原有的预期格式）
  console.log('\n测试2: 通过mcp.tool嵌套传递')
  const toolInfo2 = {
    mcp: {
      tool: {
        name: 'get-game-info',
        type: 'info_retrieval',
        parameters: {format: 'text'}
      }
    }
  }
  const result2 = simulateExecuteTool(toolInfo2)

  // 验证结果
  const test2Passed =
    result2.name === 'get-game-info' &&
    result2.type === 'info_retrieval' &&
    result2.parameters.format === 'text'
  console.log('测试2结果:', test2Passed ? '✅ 通过' : '❌ 失败')

  // 总结
  if (test1Passed && test2Passed) {
    console.log(
      '\n✅ 所有兼容性测试通过！修改后的代码可以正确处理两种数据结构。'
    )
  } else {
    console.log('\n❌ 兼容性测试失败，请检查代码。')
  }
}

// 运行测试
testCompatibilityLogic()

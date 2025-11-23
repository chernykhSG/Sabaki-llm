const i18n = require('./src/i18n.js')
const fs = require('fs')
const path = require('path')

// 加载中文语言文件
function loadChineseLanguageFile() {
  const langFilePath = path.join(__dirname, 'i18n/zh.i18n.js')
  const langContent = fs.readFileSync(langFilePath, 'utf8')

  // 执行语言文件并获取导出内容
  const langModule = new Function(`
    "use strict";
    let exports = {};
    let module = {exports};
    ${langContent};
    return module.exports;
  `)()

  // 加载翻译字符串
  i18n.loadFile(langFilePath)
  return langModule
}

// 测试函数
function runTests() {
  console.log('开始测试Golaxy翻译功能...')

  // 加载中文语言文件
  const zhLang = loadChineseLanguageFile()

  // 测试关键翻译键
  const testKeys = [
    {key: 'Start sync', namespace: 'golaxy', expected: '开始同步'},
    {key: 'Stop sync', namespace: 'golaxy', expected: '停止同步'},
    {key: 'Sync to board', namespace: 'golaxy', expected: '同步到棋盘'}
  ]

  let passedTests = 0
  const totalTests = testKeys.length

  testKeys.forEach(test => {
    const translated = i18n.t(test.namespace, test.key)
    const passed = translated === test.expected

    console.log(`${test.namespace}.${test.key}:`)
    console.log(`  期望值: "${test.expected}"`)
    console.log(`  实际值: "${translated}"`)
    console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`)
    console.log('------------------------')

    if (passed) passedTests++
  })

  // 显示总结
  console.log(`测试总结: ${passedTests}/${totalTests} 测试通过`)

  // 模拟GolaxyLivePanel中的按钮文本逻辑测试
  console.log('\n测试GolaxyLivePanel按钮文本逻辑:')

  const buttonLogicTests = [
    {
      isSyncButtonClicked: false,
      isSyncing: false,
      expectedKey: 'Sync to board'
    },
    {isSyncButtonClicked: true, isSyncing: true, expectedKey: 'Stop sync'},
    {isSyncButtonClicked: true, isSyncing: false, expectedKey: 'Start sync'}
  ]

  buttonLogicTests.forEach((test, index) => {
    const {isSyncButtonClicked, isSyncing, expectedKey} = test
    const key = isSyncButtonClicked
      ? isSyncing
        ? 'Stop sync'
        : 'Start sync'
      : 'Sync to board'
    const translated = i18n.t('golaxy', key)

    console.log(`测试场景 ${index + 1}:`)
    console.log(
      `  条件: isSyncButtonClicked=${isSyncButtonClicked}, isSyncing=${isSyncing}`
    )
    console.log(`  使用的键: "${key}"`)
    console.log(`  翻译结果: "${translated}"`)
    console.log('------------------------')
  })
}

// 运行测试
runTests()

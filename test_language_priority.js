// 测试语言加载优先级修改
const path = require('path')
const fs = require('fs')
const i18n = require('./src/i18n')

console.log('=== 语言加载优先级测试 ===')

// 1. 显示当前加载的语言
console.log('\n1. 当前应用语言:', i18n.appLang || '未设置')

// 2. 测试golaxy命名空间下的翻译
console.log('\n2. 翻译测试:')
console.log('   - Start sync ->', i18n.t('golaxy', 'Start sync'))
console.log('   - Stop sync ->', i18n.t('golaxy', 'Stop sync'))
console.log('   - Sync to board ->', i18n.t('golaxy', 'Sync to board'))

// 3. 显示i18n目录下可用的语言文件
const i18nDir = path.join(__dirname, 'i18n')
console.log('\n3. i18n目录下可用的语言文件:')
if (fs.existsSync(i18nDir)) {
  const files = fs.readdirSync(i18nDir)
  files.forEach(file => {
    if (file.endsWith('.i18n.js')) {
      console.log(`   - ${file}`)
    }
  })
}

console.log('\n=== 测试完成 ===')
console.log('修改后的加载优先级顺序:')
console.log('1. 优先扫描i18n文件夹自动加载匹配的语言文件')
console.log('2. 如果扫描失败，尝试加载保存的语言文件路径（用户手动选择的）')
console.log('3. 回退到使用语言代码加载默认语言包')

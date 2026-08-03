const nativeRequire = eval('require')

const {readFileSync} = require('fs')
const fs = require('fs')
const path = require('path')
const {load: dolmLoad, getKey: dolmGetKey} = require('dolm')
const languages = require('@sabaki/i18n')

const isElectron = process.versions.electron != null
const isRenderer = typeof window !== 'undefined' && window.sabaki != null

// Электрон подключаем только в главном процессе — в renderer'е доступ к
// ipcMain не нужен и не работает (после перехода на IPC-мост через
// src/preload.js вместо @electron/remote)
let ipcMain = null
if (isElectron && !isRenderer) {
  try {
    ipcMain = require('electron').ipcMain
  } catch (e) {
    // Не в Electron-окружении
  }
}

const setting = isRenderer
  ? {
      get: key => window.sabaki.setting.get(key),
      set: (key, value) => window.sabaki.setting.set(key, value)
    }
  : isElectron
  ? nativeRequire('./setting')
  : null

function getKey(input, params = {}) {
  let key = dolmGetKey(input, params)
  return key.replace(/&(?=\w)/g, '')
}

const dolm = dolmLoad({}, getKey)

let appLang = setting == null ? undefined : setting.get('app.lang')
let langFilePath = setting == null ? null : setting.get('app.lang_file')

exports.getKey = getKey
exports.t = dolm.t
exports.context = dolm.context

exports.formatNumber = function(num) {
  return new Intl.NumberFormat(appLang).format(num)
}

exports.formatMonth = function(month) {
  let date = new Date()
  date.setMonth(month)
  return date.toLocaleString(appLang, {month: 'long'})
}

exports.formatWeekday = function(weekday) {
  let date = new Date(2020, 2, 1 + (weekday % 7))
  return date.toLocaleString(appLang, {weekday: 'long'})
}

exports.formatWeekdayShort = function(weekday) {
  let date = new Date(2020, 2, 1 + (weekday % 7))
  return date.toLocaleString(appLang, {weekday: 'short'})
}

function loadStrings(strings) {
  dolm.load(strings)

  if (isElectron && !isRenderer && ipcMain) {
    ipcMain.emit('build-menu')
  }
}

exports.loadFile = function(filename) {
  try {
    loadStrings(
      Function(`
        "use strict"

        let exports = {}
        let module = {exports}

        ${readFileSync(filename, 'utf8')}

        return module.exports
      `)()
    )

    // Запоминаем путь к загруженному языковому файлу, чтобы подхватить
    // его же при следующем запуске
    if (setting != null && setting.set) {
      setting.set('app.lang_file', filename)
    }
  } catch (err) {
    loadStrings({})
  }
}

exports.loadLang = function(lang) {
  appLang = lang

  exports.loadFile(languages[lang].filename)
}

exports.getLanguages = function() {
  return languages
}

// Каталог i18n/ лежит рядом с src/ и в dev-режиме, и в собранном приложении
// (webpack копирует его в тот же output-каталог, что и bundle.js;
// electron-builder упаковывает его вместе с src/ по общему правилу "**/*") —
// поэтому путь относительно __dirname корректен в обоих случаях, без
// обращения к app.getAppPath() (которого в новом IPC-мосту больше нет).
function getI18nDirectory() {
  return path.join(__dirname, '..', 'i18n')
}

// Сканирует папку i18n/ и загружает подходящий языковой файл, если он есть.
// Это наш собственный механизм (в апстриме отсутствует): позволяет
// переопределить/дополнить переводы из пакета @sabaki/i18n локальными
// файлами ru.i18n.js/zh.i18n.js с разделами, специфичными для этого форка
// (ai, AIChatDrawer, golaxy, GameReviewDrawer).
function scanAndLoadLanguageFile() {
  const i18nDir = getI18nDirectory()
  let foundLanguageFile = false

  if (fs.existsSync(i18nDir)) {
    const files = fs.readdirSync(i18nDir)
    const langCode = (appLang || '').split('-')[0]

    // Приоритет: точное совпадение (zh-CN) > код языка (zh) > en
    const preferredPatterns = [
      `${appLang}.i18n.js`,
      `${langCode}.i18n.js`,
      'en.i18n.js'
    ]

    for (const pattern of preferredPatterns) {
      const matchingFile = files.find(file => file === pattern)
      if (matchingFile) {
        const filePath = path.join(i18nDir, matchingFile)
        exports.loadFile(filePath)
        foundLanguageFile = true
        break
      }
    }
  }
  return foundLanguageFile
}

// Порядок инициализации языка:
// 1. Сканируем папку i18n/ на совпадающий локальный языковой файл
// 2. Если не найден — пробуем ранее сохранённый путь (выбранный вручную)
// 3. Иначе — грузим язык из пакета @sabaki/i18n по коду языка
if (appLang != null && !scanAndLoadLanguageFile()) {
  if (langFilePath != null && typeof langFilePath === 'string') {
    try {
      exports.loadFile(langFilePath)
    } catch (err) {
      exports.loadLang(appLang)
    }
  } else {
    exports.loadLang(appLang)
  }
}

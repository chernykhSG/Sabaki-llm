import * as remote from '@electron/remote'
const setting = remote.require('./setting')
import engineSyncer from '../../../modules/enginesyncer.js'
import sabaki from '../../../modules/sabaki.js'
import commands from './commands.js'
class MCPHelper {
  constructor() {
    this.mcpEndpoints = []
    this.registerDefaultEndpoints()
  }

  registerDefaultEndpoints() {
    // 注册获取棋盘上下文端点
    this.registerGetBoardContext()

    this.registerEndpoint({
      id: 'get-game-metadata',
      name: 'Получить метаданные партии',
      description: 'Извлекает метаданные текущей партии: турнир, игроки, ранги, правила и т.д.',
      type: 'info_retrieval',
      parameters: {
        type: 'object',
        properties: {
          includeEmptyFields: {
            type: 'boolean',
            description: 'Включать ли пустые поля',
            default: false
          }
        }
      },
      handler: this.handleGetGameMetadata.bind(this)
    })

    this.registerEndpoint({
      id: 'get-game-info',
      name: 'Получить подробную информацию о партии',
      description:
        'Извлекает подробную информацию о текущей партии (турнир, игроки, ранги, правила и т.д.) и возвращает её в виде форматированной строки',
      type: 'info_retrieval',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            description: 'Формат ответа: text или object',
            enum: ['text', 'object'],
            default: 'text'
          }
        }
      },
      handler: this.handleGetGameInfo.bind(this)
    })

    this.registerEndpoint({
      id: 'katago-analysis',
      name: 'Анализ KataGo',
      description: 'Анализирует текущую партию с помощью KataGo: даёт процент побед, лучшие ходы и другую информацию',
      parameters: {
        type: 'object',
        properties: {
          lookahead: {
            type: 'number',
            description: 'Количество рассматриваемых вариантов',
            default: 5
          },
          visits: {
            type: 'number',
            description: 'Количество playout-ов анализа',
            default: 100
          }
        }
      },
      handler: this.handleKataGoAnalysis.bind(this)
    })

    this.registerEndpoint({
      id: 'katago-score',
      name: 'Оценка KataGo',
      description: 'Оценивает текущую позицию на доске с помощью KataGo',
      parameters: {
        type: 'object',
        properties: {
          visits: {
            type: 'number',
            description: 'Количество playout-ов анализа',
            default: 50
          }
        }
      },
      handler: this.handleKataGoScore.bind(this)
    })

    const gtpCommands = commands

    gtpCommands.forEach(cmd => {
      const noParamsCommands = [
        'protocol_version',
        'name',
        'version',
        'list_commands',
        'quit',
        'clear_board',
        'get_komi',
        'undo',
        'kata-get-rules',
        'kata-get-models',
        'kata-list-params',
        'showboard',
        'final_score',
        'final_status_list',
        'printsgf',
        'cputime',
        'gomill-cpu_time',
        'kata-debug-print-tc',
        'debug_moves',
        'stop'
      ]

      let parameters = null

      if (!noParamsCommands.includes(cmd.id)) {
        parameters = {
          type: 'object',
          properties: {
            args: {
              type: 'array',
              description: 'Список аргументов команды',
              items: {
                type: 'string'
              },
              default: []
            }
          }
        }
      }

      if (cmd.id === 'genmove') {
        parameters = {
          type: 'object',
          required: ['color'],
          properties: {
            color: {
              type: 'string',
              description: 'Цвет камня, которым нужно сходить: B (чёрные) или W (белые)',
              enum: ['B', 'W']
            }
          }
        }
      } else if (cmd.id === 'play') {
        parameters = {
          type: 'object',
          required: ['color', 'vertex'],
          properties: {
            color: {
              type: 'string',
              description: 'Цвет камня, которым делается ход: B (чёрные) или W (белые)',
              enum: ['B', 'W']
            },
            vertex: {
              type: 'string',
              description: 'Позиция хода, например A1, T19 или pass'
            }
          }
        }
      } else if (cmd.id === 'boardsize') {
        parameters = {
          type: 'object',
          required: ['size'],
          properties: {
            size: {
              type: 'integer',
              description: 'Размер доски, например 9, 13, 19 и т.д.',
              minimum: 1
            }
          }
        }
      } else if (cmd.id === 'rectangular_boardsize') {
        parameters = {
          type: 'object',
          required: ['width', 'height'],
          properties: {
            width: {
              type: 'integer',
              description: 'Ширина доски',
              minimum: 1
            },
            height: {
              type: 'integer',
              description: 'Высота доски',
              minimum: 1
            }
          }
        }
      } else if (cmd.id === 'komi') {
        parameters = {
          type: 'object',
          required: ['value'],
          properties: {
            value: {
              type: 'number',
              description: 'Значение коми'
            }
          }
        }
      } else if (cmd.id === 'known_command') {
        parameters = {
          type: 'object',
          required: ['command'],
          properties: {
            command: {
              type: 'string',
              description: 'Название команды для проверки'
            }
          }
        }
      } else if (cmd.id === 'kata-set-rules') {
        parameters = {
          type: 'object',
          required: ['rules'],
          properties: {
            rules: {
              type: 'string',
              description:
                'Настройка правил: JSON-словарь или краткое обозначение правил (например, tromp-taylor, chinese-kgs, aga и т.д.)'
            }
          }
        }
      } else if (cmd.id === 'kata-analyze') {
        parameters = {
          type: 'object',
          properties: {
            player: {
              type: 'string',
              description: 'Сторона, для которой выполняется анализ: B или W',
              enum: ['B', 'W']
            },
            interval: {
              type: 'integer',
              description: 'Интервал анализа'
            },
            rootInfo: {
              type: 'boolean',
              description: 'Включать ли информацию о корневом узле'
            },
            ownership: {
              type: 'boolean',
              description: 'Включать ли информацию о владении территорией'
            },
            pvVisits: {
              type: 'boolean',
              description: 'Включать ли информацию о посещениях вариантов'
            }
          }
        }
      } else if (cmd.id === 'kata-raw-nn') {
        parameters = {
          type: 'object',
          required: ['symmetry'],
          properties: {
            symmetry: {
              type: ['integer', 'string'],
              description: 'Параметр симметрии: целое число от 0 до 7 или all',
              enum: [0, 1, 2, 3, 4, 5, 6, 7, 'all']
            }
          }
        }
      } else if (cmd.id === 'kata-raw-human-nn') {
        parameters = {
          type: 'object',
          required: ['symmetry'],
          properties: {
            symmetry: {
              type: ['integer', 'string'],
              description: 'Параметр симметрии: целое число от 0 до 7 или all',
              enum: [0, 1, 2, 3, 4, 5, 6, 7, 'all']
            }
          },
          dependencies: {
            'human-model': {
              description: 'Требуется указать файл человеческой модели через аргумент командной строки -human-model'
            }
          }
        }
      } else if (cmd.id === 'kata-benchmark') {
        parameters = {
          type: 'object',
          required: ['nVisits'],
          properties: {
            nVisits: {
              type: 'integer',
              description: 'Количество посещений для бенчмарка'
            }
          }
        }
      } else if (cmd.id === 'kata-get-param') {
        parameters = {
          type: 'object',
          required: ['param'],
          properties: {
            param: {
              type: 'string',
              description: 'Название получаемого параметра'
            }
          }
        }
      } else if (cmd.id === 'kata-set-param') {
        parameters = {
          type: 'object',
          required: ['param', 'value'],
          properties: {
            param: {
              type: 'string',
              description: 'Название устанавливаемого параметра'
            },
            value: {
              type: ['string', 'number', 'boolean'],
              description: 'Устанавливаемое значение параметра'
            }
          }
        }
      } else if (cmd.id === 'set_position') {
        parameters = {
          type: 'object',
          properties: {
            position: {
              type: 'string',
              description:
                'Последовательность пар "цвет-позиция", разделённых пробелами, например "B a1 W b1" (координаты в нижнем регистре)'
            }
          }
        }
      } else if (cmd.id === 'kgs-rules') {
        parameters = {
          type: 'object',
          required: ['rules'],
          properties: {
            rules: {
              type: 'string',
              description: 'Настройка правил KGS, например chinese, japanese, aga и т.д.'
            }
          }
        }
      } else if (cmd.id === 'time_settings') {
        parameters = {
          type: 'object',
          required: ['mainTime', 'byoYomiTime', 'byoYomiStones'],
          properties: {
            mainTime: {
              type: 'integer',
              description: 'Основное время (секунды)'
            },
            byoYomiTime: {
              type: 'integer',
              description: 'Время бёи-ёми (секунды)'
            },
            byoYomiStones: {
              type: 'integer',
              description: 'Количество периодов бёи-ёми'
            }
          }
        }
      } else if (cmd.id === 'kgs-time_settings') {
        parameters = {
          type: 'object',
          required: ['mainTime', 'byoYomiTime', 'byoYomiPeriods'],
          properties: {
            mainTime: {
              type: 'integer',
              description: 'Основное время (секунды)'
            },
            byoYomiTime: {
              type: 'integer',
              description: 'Время одного периода бёи-ёми (секунды)'
            },
            byoYomiPeriods: {
              type: 'integer',
              description: 'Количество периодов бёи-ёми'
            }
          }
        }
      } else if (cmd.id === 'time_left') {
        parameters = {
          type: 'object',
          required: ['color', 'time', 'stones'],
          properties: {
            color: {
              type: 'string',
              description: 'Цвет: B или W',
              enum: ['B', 'W']
            },
            time: {
              type: 'integer',
              description: 'Оставшееся время (секунды)'
            },
            stones: {
              type: 'integer',
              description: 'Оставшееся количество периодов бёи-ёми'
            }
          }
        }
      } else if (cmd.id === 'fixed_handicap') {
        parameters = {
          type: 'object',
          required: ['n'],
          properties: {
            n: {
              type: 'integer',
              description: 'Количество форовых камней (2-9)',
              minimum: 2,
              maximum: 9
            }
          }
        }
      } else if (cmd.id === 'place_free_handicap') {
        parameters = {
          type: 'object',
          required: ['n'],
          properties: {
            n: {
              type: 'integer',
              description: 'Количество форовых камней (2-9)',
              minimum: 2,
              maximum: 9
            }
          }
        }
      } else if (cmd.id === 'set_free_handicap') {
        parameters = {
          type: 'object',
          required: ['vertices'],
          properties: {
            vertices: {
              type: 'array',
              description: 'Список позиций форовых камней, например ["A1", "T19"]',
              items: {
                type: 'string'
              }
            }
          }
        }
      } else if (
        cmd.id === 'lz-genmove_analyze' ||
        cmd.id === 'kata-genmove_analyze'
      ) {
        parameters = {
          type: 'object',
          required: ['color'],
          properties: {
            color: {
              type: 'string',
              description: 'Цвет камня, которым нужно сходить: B (чёрные) или W (белые)',
              enum: ['B', 'W']
            },
            visits: {
              type: 'integer',
              description: 'Количество playout-ов анализа'
            }
          }
        }
      } else if (cmd.id === 'lz-analyze') {
        parameters = {
          type: 'object',
          properties: {
            visits: {
              type: 'integer',
              description: 'Количество playout-ов анализа'
            }
          }
        }
      } else if (cmd.id === 'loadsgf') {
        parameters = {
          type: 'object',
          required: ['sgf'],
          properties: {
            sgf: {
              type: 'string',
              description: 'string filename - Name of an sgf file.'
            }
          }
        }
      } else if (cmd.id === 'clear_cache') {
        parameters = {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Тип кэша (необязательно)'
            }
          }
        }
      } else if (cmd.id === 'kata-set-rule') {
        parameters = {
          type: 'object',
          required: ['rule', 'value'],
          properties: {
            rule: {
              type: 'string',
              description: 'Название правила'
            },
            value: {
              type: ['string', 'number', 'boolean'],
              description: 'Значение правила'
            }
          }
        }
      } else if (
        cmd.id === 'kata-search' ||
        cmd.id === 'kata-search_cancellable' ||
        cmd.id === 'kata-search_analyze' ||
        cmd.id === 'kata-search_analyze_cancellable' ||
        cmd.id === 'kata-search_debug'
      ) {
        parameters = {
          type: 'object',
          properties: {
            player: {
              type: 'string',
              description: 'Сторона поиска: B или W',
              enum: ['B', 'W']
            },
            visits: {
              type: 'integer',
              description: 'Количество playout-ов поиска'
            }
          }
        }
      } else if (cmd.id === 'genmove_debug') {
        parameters = {
          type: 'object',
          required: ['color'],
          properties: {
            color: {
              type: 'string',
              description: 'Цвет камня, которым нужно сходить: B (чёрные) или W (белые)',
              enum: ['B', 'W']
            }
          }
        }
      } else if (cmd.id === 'kata-time_settings') {
        parameters = {
          type: 'object',
          required: ['mainTime', 'byoYomiTime', 'byoYomiStones'],
          properties: {
            mainTime: {
              type: 'integer',
              description: 'Основное время (секунды)'
            },
            byoYomiTime: {
              type: 'integer',
              description: 'Время бёи-ёми (секунды)'
            },
            byoYomiStones: {
              type: 'integer',
              description: 'Количество периодов бёи-ёми'
            }
          }
        }
      } else if (cmd.id === 'kata-list_time_settings') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'kata-list-params') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'kata-get-models') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'kata-get-rules') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'final_score') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'final_status_list') {
        parameters = {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              description: 'Тип запрашиваемого статуса (например, dead, alive и т.д.)'
            }
          }
        }
      } else if (cmd.id === 'cputime' || cmd.id === 'gomill-cpu_time') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'debug_moves') {
        parameters = {
          type: 'object',
          properties: {
            n: {
              type: 'integer',
              description: 'Количество ходов для отладки'
            }
          }
        }
      } else if (cmd.id === 'stop') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'showboard') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'printsgf') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'kata-debug-print-tc') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'undo') {
        parameters = {
          type: 'object',
          properties: {
            n: {
              type: 'integer',
              description: 'Количество отменяемых ходов, по умолчанию 1'
            }
          }
        }
      } else if (cmd.id === 'clear_board') {
        parameters = {
          type: 'object',
          properties: {}
        }
      } else if (cmd.id === 'get_komi') {
        parameters = {
          type: 'object',
          properties: {}
        }
      }

      const endpoint = {
        id: `gtp-${cmd.id}`,
        name: `GTP: ${cmd.name}`,
        description: cmd.description
      }

      if (parameters) {
        endpoint.parameters = parameters
      }

      endpoint.handler = async (params, gameContext) => {
        let commandArgs = params.args || []

        if (cmd.id === 'final_status_list' && params.status) {
          commandArgs = [params.status]
        } else if (cmd.id === 'debug_moves' && params.n !== undefined) {
          commandArgs = [params.n.toString()]
        } else if (cmd.id === 'undo' && params.n !== undefined) {
          commandArgs = [params.n.toString()]
        } else if (
          cmd.id === 'kata-search_analyze' ||
          cmd.id === 'kata-search_analyze_cancellable'
        ) {
          if (params.player) commandArgs.push(params.player)
          if (params.visits !== undefined)
            commandArgs.push(params.visits.toString())
        } else if (cmd.id === 'genmove_debug' && params.color) {
          commandArgs = [params.color]
        } else if (
          cmd.id === 'kata-time_settings' &&
          params.mainTime !== undefined &&
          params.byoYomiTime !== undefined &&
          params.byoYomiStones !== undefined
        ) {
          commandArgs = [
            params.mainTime.toString(),
            params.byoYomiTime.toString(),
            params.byoYomiStones.toString()
          ]
        }

        if (cmd.id === 'genmove' && params.color) {
          commandArgs = [params.color]
        } else if (cmd.id === 'play' && params.color && params.vertex) {
          commandArgs = [params.color, params.vertex]
        } else if (cmd.id === 'boardsize' && params.size !== undefined) {
          commandArgs = [params.size.toString()]
        } else if (
          cmd.id === 'rectangular_boardsize' &&
          params.width !== undefined &&
          params.height !== undefined
        ) {
          commandArgs = [params.width.toString(), params.height.toString()]
        } else if (cmd.id === 'komi' && params.value !== undefined) {
          commandArgs = [params.value.toString()]
        } else if (cmd.id === 'known_command' && params.command) {
          commandArgs = [params.command]
        } else if (cmd.id === 'kata-set-rules' && params.rules) {
          commandArgs = [params.rules]
        } else if (cmd.id === 'kata-analyze') {
          if (params.player) commandArgs.push(params.player)
          if (params.interval !== undefined)
            commandArgs.push(params.interval.toString())

          const boolParams = ['rootInfo', 'ownership', 'pvVisits']
          boolParams.forEach(param => {
            if (params[param] !== undefined) {
              commandArgs.push(param + '=' + (params[param] ? 'true' : 'false'))
            }
          })
        } else if (
          (cmd.id === 'kata-raw-nn' || cmd.id === 'kata-raw-human-nn') &&
          params.symmetry !== undefined
        ) {
          commandArgs = [params.symmetry.toString()]
        } else if (
          cmd.id === 'kata-benchmark' &&
          params.nVisits !== undefined
        ) {
          commandArgs = [params.nVisits.toString()]
        } else if (cmd.id === 'kata-get-param' && params.param) {
          commandArgs = [params.param]
        } else if (
          cmd.id === 'kata-set-param' &&
          params.param &&
          params.value !== undefined
        ) {
          commandArgs = [params.param, params.value.toString()]
        } else if (cmd.id === 'set_position' && params.position) {
          commandArgs = params.position.split(' ')
        }

        return await this.handleGTPCommand(cmd.name, commandArgs, gameContext)
      }

      this.registerEndpoint(endpoint)
    })
  }

  registerEndpoint(endpoint) {
    this.mcpEndpoints.push(endpoint)
  }

  vertexToGTP(vertex) {
    if (!vertex || vertex[0] < 0 || vertex[1] < 0) return 'pass'
    const alpha = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'
    let x = alpha[vertex[0]]
    let y = 19 - vertex[1]
    return x + y
  }

  async handleKataGoAnalysis(params, gameContext) {
    let syncer = null
    if (
      sabaki &&
      sabaki.state &&
      sabaki.state.attachedEngineSyncers &&
      sabaki.state.attachedEngineSyncers.length > 0
    ) {
      syncer = sabaki.state.attachedEngineSyncers[0]
    } else {
      let engine = setting.get('gtp.engine')

      if (!engine || !engine.path) {
        let enginesList = setting.get('engines.list') || []
        if (enginesList.length > 0) {
          engine = enginesList[0]
        }
      }

      if (!engine || !engine.path) {
        return {error: 'Движок KataGo не настроен'}
      }

      syncer = new engineSyncer(engine)
      syncer.start()
    }

    await syncer.sync(
      gameContext.gameTrees[gameContext.gameIndex],
      gameContext.treePosition
    )

    let visits = 100
    let analyzeCommand = {
      name: 'lz-analyze',
      args: [visits.toString()]
    }

    return new Promise(resolve => {
      syncer.on('analysis-update', () => {
        if (syncer.analysis) {
          let result = {
            winrate: syncer.analysis.winrate,
            bestMove: syncer.analysis.variations[0]?.vertex
              ? this.vertexToGTP(syncer.analysis.variations[0].vertex)
              : null,
            variations: syncer.analysis.variations
              .slice(0, params.lookahead)
              .map(v => ({
                vertex: this.vertexToGTP(v.vertex),
                winrate: v.winrate,
                visits: v.visits,
                scoreLead: v.scoreLead
              }))
          }

          // 确保分析完成后重置engineSyncer的busy状态
          // 发送一个简单的命令来触发busy状态更新
          syncer.controller.sendCommand({name: 'protocol_version'}).then(() => {
            if (
              !sabaki ||
              !sabaki.state ||
              !sabaki.state.attachedEngineSyncers ||
              !sabaki.state.attachedEngineSyncers.find(s => s.id === syncer.id)
            ) {
              syncer.stop()
            }
            resolve({data: result})
          })
        }
      })

      syncer.queueCommand(analyzeCommand)

      setTimeout(() => {
        // 超时情况下也发送protocol_version命令来重置busy状态
        syncer.controller
          .sendCommand({name: 'protocol_version'})
          .then(() => {
            if (
              !sabaki ||
              !sabaki.state ||
              !sabaki.state.attachedEngineSyncers ||
              !sabaki.state.attachedEngineSyncers.find(s => s.id === syncer.id)
            ) {
              syncer.stop()
            }
            resolve({error: 'Тайм-аут анализа'})
          })
          .catch(() => {
            // 如果命令发送失败，直接处理超时
            if (
              !sabaki ||
              !sabaki.state ||
              !sabaki.state.attachedEngineSyncers ||
              !sabaki.state.attachedEngineSyncers.find(s => s.id === syncer.id)
            ) {
              syncer.stop()
            }
            resolve({error: 'Тайм-аут анализа'})
          })
      }, 100000)
    })
  }

  async handleGetEngineName(params, gameContext) {
    let engine = setting.get('gtp.engine')

    if (!engine || !engine.path) {
      let enginesList = setting.get('engines.list') || []
      if (enginesList.length > 0) {
        engine = enginesList[0]
      }
    }

    if (!engine || !engine.path) {
      return {data: {name: 'Движок не настроен'}}
    }

    let engineName = engine.name || 'Неизвестный движок'
    return {data: {name: engineName}}
  }

  async handleGetEngineCommands(params, gameContext) {
    let syncer = null
    let needStop = false

    if (
      sabaki &&
      sabaki.state &&
      sabaki.state.attachedEngineSyncers &&
      sabaki.state.attachedEngineSyncers.length > 0
    ) {
      syncer = sabaki.state.attachedEngineSyncers[0]
    } else {
      let engine = setting.get('gtp.engine')

      if (!engine || !engine.path) {
        let enginesList = setting.get('engines.list') || []
        if (enginesList.length > 0) {
          engine = enginesList[0]
        }
      }

      if (!engine || !engine.path) {
        return {error: 'Движок не настроен'}
      }

      syncer = new engineSyncer(engine)
      syncer.start()
      needStop = true
    }

    let response = await syncer.queueCommand({name: 'list_commands'})

    if (needStop) {
      await syncer.stop()
    }

    let commands = response.content
      .split('\n')
      .filter(
        line => line.trim() && !line.startsWith('=') && !line.startsWith('?')
      )
      .map(line => line.trim())

    return {data: {commands: commands}}
  }

  async handleKataGoScore(params, gameContext) {
    let syncer = null
    let needStop = false

    if (
      sabaki &&
      sabaki.state &&
      sabaki.state.attachedEngineSyncers &&
      sabaki.state.attachedEngineSyncers.length > 0
    ) {
      syncer = sabaki.state.attachedEngineSyncers[0]
    } else {
      let engine = setting.get('gtp.engine')

      if (!engine || !engine.path) {
        let enginesList = setting.get('engines.list') || []
        if (enginesList.length > 0) {
          engine = enginesList[0]
        }
      }

      if (!engine || !engine.path) {
        return {error: 'Движок KataGo не настроен'}
      }

      syncer = new engineSyncer(engine)
      syncer.start()
      needStop = true
    }

    await syncer.sync(
      gameContext.gameTrees[gameContext.gameIndex],
      gameContext.treePosition
    )

    let response = await syncer.queueCommand({name: 'final_score'})

    if (needStop) {
      await syncer.stop()
    }

    return {data: {score: response.content.trim()}}
  }

  async handleGTPCommand(command, args, gameContext) {
    if (command === 'genmove' && args.length < 1) {
      return {command, args, response: '? Отсутствует параметр цвета', success: false}
    }
    if (command === 'play' && args.length < 2) {
      return {command, args, response: '? Отсутствует параметр цвета или позиции', success: false}
    }
    if (
      (command === 'boardsize' ||
        command === 'fixed_handicap' ||
        command === 'place_free_handicap' ||
        command === 'komi' ||
        command === 'known_command' ||
        command === 'kata-set-rules' ||
        command === 'kata-raw-nn' ||
        command === 'kata-benchmark' ||
        command === 'kata-get-param' ||
        command === 'kgs-rules') &&
      args.length < 1
    ) {
      return {command, args, response: '? Отсутствует обязательный параметр', success: false}
    }
    if (
      (command === 'rectangular_boardsize' ||
        command === 'set_free_handicap' ||
        command === 'kata-set-param' ||
        command === 'time_settings' ||
        command === 'kgs-time_settings' ||
        command === 'time_left') &&
      args.length < 2
    ) {
      return {command, args, response: '? Отсутствует обязательный параметр', success: false}
    }
    if (command === 'time_settings' && args.length < 3) {
      return {
        command,
        args,
        response: '? Отсутствуют полные параметры настройки времени',
        success: false
      }
    }
    if (command === 'kgs-time_settings' && args.length < 3) {
      return {
        command,
        args,
        response: '? Отсутствуют полные параметры настройки времени KGS',
        success: false
      }
    }
    if (
      command === 'lz-genmove_analyze' ||
      command === 'kata-genmove_analyze'
    ) {
      if (args.length < 1) {
        return {command, args, response: '? Отсутствует параметр цвета', success: false}
      }
      if (!['B', 'W'].includes(args[0].toUpperCase())) {
        return {command, args, response: '? Параметр цвета должен быть B или W', success: false}
      }
    }
    if (command === 'loadsgf' && args.length < 1) {
      return {command, args, response: '? Отсутствует содержимое SGF', success: false}
    }
    if (command === 'kata-set-rule' && args.length < 2) {
      return {command, args, response: '? Отсутствует название или значение правила', success: false}
    }
    if (command === 'fixed_handicap' || command === 'place_free_handicap') {
      if (args.length > 0) {
        const n = parseInt(args[0])
        if (isNaN(n) || n < 2 || n > 9) {
          return {
            command,
            args,
            response: '? Количество форовых камней должно быть от 2 до 9',
            success: false
          }
        }
      }
    }
    if (command === 'play' && args && !['B', 'W'].includes(args[0])) {
      return {
        command,
        args,
        response: '? Первый параметр команды play должен быть B или W',
        success: false
      }
    }

    let syncer = null
    let needStop = false

    if (
      sabaki &&
      sabaki.state &&
      sabaki.state.attachedEngineSyncers &&
      sabaki.state.attachedEngineSyncers.length > 0
    ) {
      syncer = sabaki.state.attachedEngineSyncers[0]
    } else {
      let engine = setting.get('gtp.engine')

      if (!engine || !engine.path) {
        let enginesList = setting.get('engines.list') || []
        if (enginesList.length > 0) {
          engine = enginesList[0]
        }
      }

      if (!engine || !engine.path) {
        return {error: 'Движок не настроен'}
      }

      syncer = new engineSyncer(engine)
      syncer.start()
      needStop = true
    }

    const needSync = [
      'genmove',
      'play',
      'undo',
      'final_score',
      'showboard',
      'final_status_list',
      'lz-analyze',
      'kata-analyze',
      'kata-search',
      'kata-genmove_analyze'
    ]
    if (needSync.includes(command)) {
      await syncer.sync(
        gameContext.gameTrees[gameContext.gameIndex],
        gameContext.treePosition
      )
    }

    let response = await syncer.queueCommand({name: command, args: args || []})

    if (needStop) {
      await syncer.stop()
    }

    return {
      data: {
        command: command,
        args: args || [],
        response: response.content.trim(),
        success: response.status === 0 || response.error == false
      }
    }
  }

  generateMCPMessage(endpointId, params) {
    let endpoint = this.mcpEndpoints.find(e => e.id === endpointId)
    if (!endpoint) {
      return {error: `Неизвестная конечная точка MCP: ${endpointId}`}
    }

    return {
      mcp: {
        tool: {
          name: endpoint.name,
          description: endpoint.description,
          parameters: params
        }
      }
    }
  }

  async handleMCPRequest(mcpRequest, gameContext) {
    // 检查MCP请求格式
    if (!mcpRequest.mcp || !mcpRequest.mcp.tool) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: 'Некорректный формат MCP-запроса'
        }
      }
    }

    let toolName = mcpRequest.mcp.tool.name
    let endpoint = this.mcpEndpoints.find(e => e.name === toolName || e.id===toolName)

    // 检查工具是否存在
    if (!endpoint) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found',
          data: `Инструмент не найден: ${toolName}`
        }
      }
    }

    try {
      return await endpoint.handler(
        mcpRequest.mcp.tool.parameters || {},
        gameContext
      )
    } catch (error) {
      // 处理服务器错误
      console.error(`Ошибка обработки MCP - инструмент: ${toolName}`, error)
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: `Внутренняя ошибка сервера: ${error.message}`
        }
      }
    }
  }

  /**
   * 注册获取棋盘上下文端点
   */
  registerGetBoardContext() {
    this.registerEndpoint({
      id: 'get-board-context',
      name: 'Получить контекст доски',
      description: 'Получает контекстную информацию о доске текущей партии, включая всю историю ходов',
      type: 'info_retrieval', // 更新为信息检索类型
      parameters: {
        type: 'object',
        properties: {
          includeFullHistory: {
            type: 'boolean',
            description: 'Включать ли полную историю партии',
            default: true
          }
        }
      },
      handler: this.handleGetBoardContext.bind(this)
    })
  }

  /**
   * 处理获取棋局元信息的请求
   */
  async handleGetGameMetadata(params, gameContext) {
    try {
      const {includeEmptyFields = false} = params || {}

      // 获取当前游戏树
      const tree =
        gameContext?.gameTrees?.[gameContext.gameIndex] ||
        sabaki?.state?.gameTrees?.[sabaki.state.gameIndex]
      if (!tree || !tree.root) {
        return {success: false, error: 'Текущая партия не найдена'}
      }

      const rootNode = tree.root
      const metadata = {}
      const fieldMapping = {
        GN: 'Турнир',
        PB: 'Чёрные',
        PW: 'Белые',
        BR: 'Ранг чёрных',
        WR: 'Ранг белых',
        KM: 'Коми',
        RU: 'Правила',
        SZ: 'Размер доски',
        HA: 'Число форовых камней',
        RE: 'Результат'
      }

      // 提取元信息
      Object.entries(fieldMapping).forEach(([key, label]) => {
        if (rootNode.data[key]) {
          metadata[key] = {
            label: label,
            value: rootNode.data[key]
          }
        } else if (includeEmptyFields) {
          metadata[key] = {
            label: label,
            value: null
          }
        }
      })

      return {
        success: true,
        data: {
          metadata: metadata,
          hasMetadata: Object.keys(metadata).length > 0,
          metadataCount: Object.keys(metadata).length
        }
      }
    } catch (error) {
      console.error('Не удалось получить метаданные партии:', error)
      return {
        success: false,
        error: error.message || 'Не удалось получить метаданные партии'
      }
    }
  }

  /**
   * 处理获取棋局详细信息的请求
   */
  async handleGetGameInfo(params, gameContext) {
    try {
      const {format = 'text'} = params || {}

      // 获取当前游戏树
      const tree =
        gameContext?.gameTrees?.[gameContext.gameIndex] ||
        sabaki?.state?.gameTrees?.[sabaki.state.gameIndex]

      if (!tree || !tree.root || !tree.root.data) {
        return {
          success: false,
          error: 'Текущая партия или данные партии не найдены'
        }
      }

      const rootNode = tree.root
      let gameInfo = ''
      let metaInfo = []

      // 提取棋局元信息
      if (rootNode.data.GN) metaInfo.push(`Турнир: ${rootNode.data.GN}`)
      if (rootNode.data.PB) metaInfo.push(`Чёрные: ${rootNode.data.PB}`)
      if (rootNode.data.PW) metaInfo.push(`Белые: ${rootNode.data.PW}`)
      if (rootNode.data.BR) metaInfo.push(`Ранг чёрных: ${rootNode.data.BR}`)
      if (rootNode.data.WR) metaInfo.push(`Ранг белых: ${rootNode.data.WR}`)
      if (rootNode.data.KM) metaInfo.push(`Коми: ${rootNode.data.KM}`)
      if (rootNode.data.RU) metaInfo.push(`Правила: ${rootNode.data.RU}`)
      if (rootNode.data.SZ) metaInfo.push(`Размер доски: ${rootNode.data.SZ}`)
      if (rootNode.data.HA) metaInfo.push(`Число форовых камней: ${rootNode.data.HA}`)
      if (rootNode.data.RE) metaInfo.push(`Результат: ${rootNode.data.RE}`)

      if (format === 'text') {
        // 返回格式化文本
        if (metaInfo.length > 0) {
          gameInfo = 'Информация о партии:\n' + metaInfo.join('\n')
        } else {
          gameInfo = 'Метаданные партии не найдены'
        }

        return {
          success: true,
          content: gameInfo
        }
      } else {
        // 返回对象格式
        const metadata = {}
        const fieldMapping = {
          GN: 'Турнир',
          PB: 'Чёрные',
          PW: 'Белые',
          BR: 'Ранг чёрных',
          WR: 'Ранг белых',
          KM: 'Коми',
          RU: 'Правила',
          SZ: 'Размер доски',
          HA: 'Число форовых камней',
          RE: 'Результат'
        }

        Object.entries(fieldMapping).forEach(([key, label]) => {
          if (rootNode.data[key]) {
            metadata[key] = {
              label: label,
              value: rootNode.data[key]
            }
          }
        })

        return {
          success: true,
          data: {
            metadata: metadata,
            hasMetadata: Object.keys(metadata).length > 0,
            metadataCount: Object.keys(metadata).length
          }
        }
      }
    } catch (error) {
      console.error('Не удалось получить подробную информацию о партии:', error)
      return {
        success: false,
        error: error.message || 'Не удалось получить подробную информацию о партии'
      }
    }
  }

  /**
   * 处理获取棋盘上下文的请求
   */
  async handleGetBoardContext(params, gameContext) {
    try {
      let {gameTrees, gameIndex, treePosition} = gameContext
      let tree = gameTrees[gameIndex]
      let currentNode = tree.get(treePosition)
      let moves = []
      let node = currentNode

      // 收集所有着法历史
      while (node) {
        if (node.data.B) moves.unshift(`B[${node.data.B.join('][')}]`)
        if (node.data.W) moves.unshift(`W[${node.data.W.join('][')}]`)
        node = tree.get(node.parentId)
      }

      // 构建boardContext字符串
      const boardContext = moves.join('\n')

      return {
        success: true,
        data: {
          boardContext: boardContext,
          moveCount: moves.length,
          currentNodeId: currentNode.id
        }
      }
    } catch (error) {
      console.log('Не удалось получить контекст доски:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  getAvailableEndpoints() {
    return this.mcpEndpoints.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      parameters: e.parameters
    }))
  }
}

export default new MCPHelper()

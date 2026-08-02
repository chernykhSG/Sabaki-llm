import * as remote from '@electron/remote'
import {BoundedGoban} from '@sabaki/shudan'
import sgf from '@sabaki/sgf'

import * as gametree from './gametree.js'
import * as gobantransformer from './gobantransformer.js'
import * as helper from './helper.js'
import sabaki from './sabaki.js'
import setting from '../setting.js'

class GobanMCPEndpoints {
  constructor() {
    this.endpoints = []
    this.registerDefaultEndpoints()
  }

  /**
   * 注册新的MCP端点
   */
  registerEndpoint(endpoint) {
    this.endpoints.push(endpoint)
  }

  /**
   * 注册默认的棋盘操作端点
   */
  registerDefaultEndpoints() {
    // 棋盘变换端点
    this.registerTransformationEndpoints()

    // 标记工具端点
    this.registerMarkerEndpoints()

    // 线条绘制端点
    this.registerLineEndpoints()

    // 显示设置端点
    this.registerDisplaySettingEndpoints()

    // 变化播放端点
    this.registerVariationEndpoints()

    // 热图相关端点
    this.registerHeatmapEndpoints()

    // 棋盘操作端点
    this.registerBoardOperationEndpoints()
  }

  /**
   * 注册棋盘变换端点
   */
  registerTransformationEndpoints() {
    this.registerEndpoint({
      id: 'goban-transform-rotate',
      name: 'Поворот доски',
      description: 'Поворачивает доску',
      parameters: {
        type: 'object',
        properties: {
          degrees: {
            type: 'number',
            description: 'Угол поворота: поддерживаются значения 90, 180, 270',
            enum: [90, 180, 270],
            default: 90
          }
        }
      },
      handler: this.handleTransformRotate.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-transform-flip',
      name: 'Отражение доски',
      description: 'Отражает доску по горизонтали или вертикали',
      parameters: {
        type: 'object',
        properties: {
          axis: {
            type: 'string',
            description:
              'Ось отражения: horizontal — по горизонтали, vertical — по вертикали',
            enum: ['horizontal', 'vertical'],
            default: 'horizontal'
          }
        }
      },
      handler: this.handleTransformFlip.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-transform-invert',
      name: 'Инверсия доски',
      description: 'Инвертирует цвета камней на доске',
      parameters: {},
      handler: this.handleTransformInvert.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-transform-reset',
      name: 'Сброс трансформаций',
      description: 'Сбрасывает все трансформации доски',
      parameters: {},
      handler: this.handleTransformReset.bind(this)
    })
  }

  /**
   * 注册标记工具端点
   */
  registerMarkerEndpoints() {
    const markerTypes = [
      'triangle',
      'square',
      'circle',
      'cross',
      'number',
      'label'
    ]

    markerTypes.forEach(type => {
      this.registerEndpoint({
        id: `goban-marker-${type}`,
        name: `Метка «${this.getMarkerTypeName(type)}»`,
        description: `Добавляет метку «${this.getMarkerTypeName(type)}» в указанную позицию`,
        parameters: {
          type: 'object',
          required: ['vertex'],
          properties: {
            vertex: {
              type: 'string',
              description: 'Позиция метки, например A1, T19'
            },
            label: {
              type: 'string',
              description:
                'Текст метки (используется, если тип метки — label или number)'
            }
          }
        },
        handler: params => this.handleAddMarker(params, type)
      })
    })

    this.registerEndpoint({
      id: 'goban-marker-remove',
      name: 'Удаление метки',
      description: 'Удаляет метку в указанной позиции',
      parameters: {
        type: 'object',
        required: ['vertex'],
        properties: {
          vertex: {
            type: 'string',
            description: 'Позиция метки, например A1, T19'
          }
        }
      },
      handler: this.handleRemoveMarker.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-marker-clear-all',
      name: 'Очистка всех меток',
      description: 'Удаляет все метки с доски',
      parameters: {},
      handler: this.handleClearAllMarkers.bind(this)
    })
  }

  /**
   * 注册线条绘制端点
   */
  registerLineEndpoints() {
    this.registerEndpoint({
      id: 'goban-line-draw',
      name: 'Рисование линии',
      description: 'Рисует линию между двумя точками',
      parameters: {
        type: 'object',
        required: ['v1', 'v2'],
        properties: {
          v1: {
            type: 'string',
            description: 'Начальная позиция, например A1, T19'
          },
          v2: {
            type: 'string',
            description: 'Конечная позиция, например A1, T19'
          },
          type: {
            type: 'string',
            description: 'Тип линии: line — прямая линия, arrow — стрелка',
            enum: ['line', 'arrow'],
            default: 'line'
          }
        }
      },
      handler: this.handleDrawLine.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-line-remove',
      name: 'Удаление линии',
      description: 'Удаляет указанную линию',
      parameters: {
        type: 'object',
        required: ['v1', 'v2'],
        properties: {
          v1: {
            type: 'string',
            description: 'Начальная позиция, например A1, T19'
          },
          v2: {
            type: 'string',
            description: 'Конечная позиция, например A1, T19'
          }
        }
      },
      handler: this.handleRemoveLine.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-line-clear-all',
      name: 'Очистка всех линий',
      description: 'Удаляет все линии с доски',
      parameters: {},
      handler: this.handleClearAllLines.bind(this)
    })
  }

  /**
   * 注册显示设置端点
   */
  registerDisplaySettingEndpoints() {
    this.registerEndpoint({
      id: 'goban-setting-coordinates',
      name: 'Настройка отображения координат',
      description: 'Включает или отключает отображение координат',
      parameters: {
        type: 'object',
        properties: {
          show: {
            type: 'boolean',
            description: 'Показывать координаты',
            default: true
          },
          type: {
            type: 'string',
            description:
              'Тип координат. Допустимые значения: A1, 1-1, relative, all-alpha',
            enum: ['A1', '1-1', 'relative', 'all-alpha']
          }
        }
      },
      handler: this.handleSetCoordinates.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-setting-move-numbers',
      name: 'Настройка номеров ходов',
      description: 'Включает или отключает отображение номеров ходов',
      parameters: {
        type: 'object',
        properties: {
          show: {
            type: 'boolean',
            description: 'Показывать номера ходов',
            default: false
          }
        }
      },
      handler: this.handleSetMoveNumbers.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-setting-next-moves',
      name: 'Настройка предпросмотра следующего хода',
      description: 'Включает или отключает предпросмотр следующего хода',
      parameters: {
        type: 'object',
        properties: {
          show: {
            type: 'boolean',
            description: 'Показывать предпросмотр следующего хода',
            default: true
          }
        }
      },
      handler: this.handleSetNextMoves.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-setting-siblings',
      name: 'Настройка предпросмотра вариантов',
      description:
        'Включает или отключает предпросмотр вариантов (соседних веток)',
      parameters: {
        type: 'object',
        properties: {
          show: {
            type: 'boolean',
            description: 'Показывать предпросмотр вариантов',
            default: true
          }
        }
      },
      handler: this.handleSetSiblings.bind(this)
    })
  }

  /**
   * 注册变化播放端点
   */
  registerVariationEndpoints() {
    this.registerEndpoint({
      id: 'goban-variation-play',
      name: 'Воспроизведение варианта',
      description: 'Воспроизводит указанный вариант',
      parameters: {
        type: 'object',
        required: ['moves'],
        properties: {
          moves: {
            type: 'array',
            description:
              'Список ходов варианта; каждый ход задаётся координатами [x, y]',
            items: {
              type: 'array',
              items: {
                type: 'number'
              }
            }
          },
          sign: {
            type: 'number',
            description: 'Цвет хода: 1 — чёрные, -1 — белые',
            enum: [1, -1],
            default: 1
          },
          sibling: {
            type: 'boolean',
            description: 'Является ли вариант побочной веткой',
            default: false
          }
        }
      },
      handler: this.handlePlayVariation.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-variation-stop',
      name: 'Остановка воспроизведения',
      description: 'Останавливает текущее воспроизведение варианта',
      parameters: {},
      handler: this.handleStopPlayback.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-variation-set-replay-mode',
      name: 'Настройка режима воспроизведения',
      description: 'Задаёт режим воспроизведения вариантов',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            description:
              'Режим воспроизведения: instantly — мгновенное отображение, move_by_move — пошаговое отображение',
            enum: ['instantly', 'move_by_move'],
            default: 'move_by_move'
          },
          interval: {
            type: 'number',
            description: 'Интервал между ходами при пошаговом отображении (в миллисекундах)',
            minimum: 100,
            maximum: 5000
          }
        }
      },
      handler: this.handleSetReplayMode.bind(this)
    })
  }

  /**
   * 注册热图相关端点
   */
  registerHeatmapEndpoints() {
    this.registerEndpoint({
      id: 'goban-heatmap-toggle',
      name: 'Переключение отображения тепловой карты',
      description: 'Переключает состояние отображения тепловой карты',
      parameters: {
        type: 'object',
        properties: {
          show: {
            type: 'boolean',
            description: 'Показывать тепловую карту'
          }
        }
      },
      handler: this.handleToggleHeatmap.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-heatmap-set-intensity',
      name: 'Настройка отображения интенсивности тепловой карты',
      description:
        'Включает или отключает отображение интенсивности тепловой карты',
      parameters: {
        type: 'object',
        properties: {
          show: {
            type: 'boolean',
            description: 'Показывать интенсивность тепловой карты',
            default: true
          }
        }
      },
      handler: this.handleSetHeatmapIntensity.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-heatmap-set-type',
      name: 'Настройка типа тепловой карты',
      description: 'Задаёт тип отображаемой тепловой карты',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description:
              'Тип тепловой карты: winrate — процент побед, scoreLead — разница в счёте',
            enum: ['winrate', 'scoreLead'],
            default: 'winrate'
          }
        }
      },
      handler: this.handleSetHeatmapType.bind(this)
    })
  }

  /**
   * 注册棋盘操作端点
   */
  registerBoardOperationEndpoints() {
    this.registerEndpoint({
      id: 'goban-place-stone',
      name: 'Размещение камня',
      description: 'Ставит камень в указанную позицию',
      parameters: {
        type: 'object',
        required: ['vertex', 'color'],
        properties: {
          vertex: {
            type: 'string',
            description: 'Позиция для размещения, например A1, T19'
          },
          color: {
            type: 'string',
            description: 'Цвет камня: B — чёрный, W — белый',
            enum: ['B', 'W']
          }
        }
      },
      handler: this.handlePlaceStone.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-remove-stone',
      name: 'Удаление камня',
      description: 'Убирает камень с указанной позиции',
      parameters: {
        type: 'object',
        required: ['vertex'],
        properties: {
          vertex: {
            type: 'string',
            description: 'Позиция для удаления, например A1, T19'
          }
        }
      },
      handler: this.handleRemoveStone.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-clear-board',
      name: 'Очистка доски',
      description: 'Убирает с доски все камни',
      parameters: {},
      handler: this.handleClearBoard.bind(this)
    })

    this.registerEndpoint({
      id: 'goban-get-board-state',
      name: 'Получение состояния доски',
      description: 'Возвращает информацию о текущем состоянии доски',
      parameters: {},
      handler: this.handleGetBoardState.bind(this)
    })
  }

  /**
   * 获取标记类型的中文名称
   */
  getMarkerTypeName(type) {
    const typeNames = {
      triangle: 'треугольник',
      square: 'квадрат',
      circle: 'круг',
      cross: 'крест',
      number: 'номер',
      label: 'надпись'
    }
    return typeNames[type] || type
  }

  /**
   * 将字符串坐标转换为数字坐标
   */
  stringToVertex(vertexStr) {
    if (!vertexStr) return null
    return sgf.parseVertex(vertexStr)
  }

  /**
   * 获取当前游戏上下文
   */
  getGameContext() {
    if (!sabaki || !sabaki.state) {
      return null
    }

    return {
      gameTrees: sabaki.state.gameTrees,
      gameIndex: sabaki.state.gameIndex,
      treePosition: sabaki.state.treePosition
    }
  }

  /**
   * 处理旋转棋盘
   */
  handleTransformRotate(params) {
    try {
      const {degrees} = params
      let currentTransform = sabaki.state.gobanTransformation || ''

      // 添加旋转变换
      if (degrees === 90) currentTransform += 'r'
      else if (degrees === 180) currentTransform += 'rr'
      else if (degrees === 270) currentTransform += 'rrr'

      // 限制变换长度
      while (currentTransform.length > 5) {
        currentTransform = currentTransform.slice(1)
      }

      sabaki.setState({gobanTransformation: currentTransform})
      return {data: {transformation: currentTransform}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理翻转棋盘
   */
  handleTransformFlip(params) {
    try {
      const {axis} = params
      let currentTransform = sabaki.state.gobanTransformation || ''

      // 添加翻转变换
      if (axis === 'horizontal') currentTransform += 'h'
      else if (axis === 'vertical') currentTransform += 'v'

      // 限制变换长度
      while (currentTransform.length > 5) {
        currentTransform = currentTransform.slice(1)
      }

      sabaki.setState({gobanTransformation: currentTransform})
      return {data: {transformation: currentTransform}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理反转棋盘
   */
  handleTransformInvert(params) {
    try {
      let currentTransform = sabaki.state.gobanTransformation || ''

      // 添加反转变换
      currentTransform += 'i'

      // 限制变换长度
      while (currentTransform.length > 5) {
        currentTransform = currentTransform.slice(1)
      }

      sabaki.setState({gobanTransformation: currentTransform})
      return {data: {transformation: currentTransform}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理重置变换
   */
  handleTransformReset(params) {
    try {
      sabaki.setState({gobanTransformation: ''})
      return {data: {transformation: ''}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理添加标记
   */
  handleAddMarker(params, type) {
    try {
      const {vertex, label} = params
      const coord = this.stringToVertex(vertex)

      if (!coord || coord[0] < 0 || coord[1] < 0) {
        return {error: 'Некорректная позиция координат'}
      }

      let markerData = {type}
      if ((type === 'label' || type === 'number') && label) {
        markerData.label = label
      }

      // 调用sabaki的标记功能
      sabaki.addMarker(coord, markerData)
      return {data: {vertex, marker: markerData}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理移除标记
   */
  handleRemoveMarker(params) {
    try {
      const {vertex} = params
      const coord = this.stringToVertex(vertex)

      if (!coord || coord[0] < 0 || coord[1] < 0) {
        return {error: 'Некорректная позиция координат'}
      }

      // 调用sabaki的移除标记功能
      sabaki.removeMarker(coord)
      return {data: {vertex}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理清除所有标记
   */
  handleClearAllMarkers(params) {
    try {
      // 清除所有标记
      sabaki.clearMarkers()
      return {data: {success: true}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理绘制线条
   */
  handleDrawLine(params) {
    try {
      const {v1, v2, type = 'line'} = params
      const coord1 = this.stringToVertex(v1)
      const coord2 = this.stringToVertex(v2)

      if (
        !coord1 ||
        !coord2 ||
        coord1[0] < 0 ||
        coord1[1] < 0 ||
        coord2[0] < 0 ||
        coord2[1] < 0
      ) {
        return {error: 'Некорректная позиция координат'}
      }

      // 调用sabaki的绘制线条功能
      sabaki.addLine(coord1, coord2, type)
      return {data: {v1: coord1, v2: coord2, type}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理移除线条
   */
  handleRemoveLine(params) {
    try {
      const {v1, v2} = params
      const coord1 = this.stringToVertex(v1)
      const coord2 = this.stringToVertex(v2)

      if (
        !coord1 ||
        !coord2 ||
        coord1[0] < 0 ||
        coord1[1] < 0 ||
        coord2[0] < 0 ||
        coord2[1] < 0
      ) {
        return {error: 'Некорректная позиция координат'}
      }

      // 调用sabaki的移除线条功能
      sabaki.removeLine(coord1, coord2)
      return {data: {v1: coord1, v2: coord2}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理清除所有线条
   */
  handleClearAllLines(params) {
    try {
      // 清除所有线条
      sabaki.clearLines()
      return {data: {success: true}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置坐标显示
   */
  handleSetCoordinates(params) {
    try {
      const {show, type} = params

      if (show !== undefined) {
        setting.set('board.show_coordinates', show)
      }

      if (type) {
        setting.set('board.coordinates_type', type)
      }

      return {
        data: {
          show: setting.get('board.show_coordinates'),
          type: setting.get('board.coordinates_type')
        }
      }
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置落子编号
   */
  handleSetMoveNumbers(params) {
    try {
      const {show} = params
      setting.set('board.show_move_numbers', show)
      return {data: {show}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置下一步预览
   */
  handleSetNextMoves(params) {
    try {
      const {show} = params
      setting.set('board.show_next_moves', show)
      return {data: {show}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置分支预览
   */
  handleSetSiblings(params) {
    try {
      const {show} = params
      setting.set('board.show_siblings', show)
      return {data: {show}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理播放变化
   */
  handlePlayVariation(params) {
    try {
      const {moves, sign = 1, sibling = false} = params

      // 设置播放变化
      sabaki.setState({
        playVariation: {
          sign,
          moves,
          sibling
        }
      })

      return {data: {sign, moves: moves.length, sibling}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理停止播放
   */
  handleStopPlayback(params) {
    try {
      // 停止播放变化
      sabaki.setState({playVariation: null})
      return {data: {success: true}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置回放模式
   */
  handleSetReplayMode(params) {
    try {
      const {mode, interval} = params

      if (mode) {
        setting.set('board.variation_replay_mode', mode)
      }

      if (interval !== undefined) {
        setting.set('board.variation_replay_interval', interval)
      }

      return {
        data: {
          mode: setting.get('board.variation_replay_mode'),
          interval: setting.get('board.variation_replay_interval')
        }
      }
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理切换热图显示
   */
  handleToggleHeatmap(params) {
    try {
      const {show} = params

      if (show !== undefined) {
        setting.set('board.analysis_enabled', show)
      } else {
        // 切换当前状态
        const current = setting.get('board.analysis_enabled')
        setting.set('board.analysis_enabled', !current)
      }

      return {data: {show: setting.get('board.analysis_enabled')}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置热图强度显示
   */
  handleSetHeatmapIntensity(params) {
    try {
      const {show} = params
      setting.set('board.heatmap_show_intensity', show)
      return {data: {show}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理设置热图类型
   */
  handleSetHeatmapType(params) {
    try {
      const {type} = params
      setting.set('board.analysis_type', type)
      return {data: {type}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理放置棋子
   */
  handlePlaceStone(params) {
    try {
      const {vertex, color} = params
      const coord = this.stringToVertex(vertex)

      if (!coord || coord[0] < 0 || coord[1] < 0) {
        return {error: 'Некорректная позиция координат'}
      }

      const sign = color === 'B' ? 1 : -1

      // 调用sabaki的放置棋子功能
      sabaki.addNode(coord, sign)
      return {data: {vertex: coord, color, sign}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理移除棋子
   */
  handleRemoveStone(params) {
    try {
      const {vertex} = params
      const coord = this.stringToVertex(vertex)

      if (!coord || coord[0] < 0 || coord[1] < 0) {
        return {error: 'Некорректная позиция координат'}
      }

      // 调用sabaki的移除棋子功能
      sabaki.removeStone(coord)
      return {data: {vertex: coord}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理清空棋盘
   */
  handleClearBoard(params) {
    try {
      // 清空棋盘
      sabaki.clearBoard()
      return {data: {success: true}}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 处理获取棋盘状态
   */
  handleGetBoardState(params) {
    try {
      const gameContext = this.getGameContext()
      if (!gameContext) {
        return {error: 'Не удалось получить игровой контекст'}
      }

      const {gameTrees, gameIndex, treePosition} = gameContext
      const gameTree = gameTrees[gameIndex]

      if (!gameTree) {
        return {error: 'Не удалось получить текущее дерево партии'}
      }

      const board = gametree.getBoard(gameTree, treePosition.id)

      // 转换棋盘状态数据
      const state = {
        width: board.width,
        height: board.height,
        signMap: board.signMap,
        markers: board.markers,
        lines: board.lines,
        transformation: sabaki.state.gobanTransformation || '',
        settings: {
          showCoordinates: setting.get('board.show_coordinates'),
          coordinatesType: setting.get('board.coordinates_type'),
          showMoveNumbers: setting.get('board.show_move_numbers'),
          showNextMoves: setting.get('board.show_next_moves'),
          showSiblings: setting.get('board.show_siblings'),
          analysisEnabled: setting.get('board.analysis_enabled'),
          analysisType: setting.get('board.analysis_type'),
          heatmapShowIntensity: setting.get('board.heatmap_show_intensity')
        }
      }

      return {data: state}
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 生成MCP消息
   */
  generateMCPMessage(endpointId, params) {
    const endpoint = this.endpoints.find(e => e.id === endpointId)
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

  /**
   * 处理MCP请求
   */
  async handleMCPRequest(mcpRequest) {
    if (!mcpRequest.mcp || !mcpRequest.mcp.tool) {
      return {error: 'Некорректный формат MCP-запроса'}
    }

    const toolName = mcpRequest.mcp.tool.name
    const endpoint = this.endpoints.find(e => e.name === toolName)

    if (!endpoint) {
      return {error: `Инструмент не найден: ${toolName}`}
    }

    try {
      return await endpoint.handler(mcpRequest.mcp.tool.parameters || {})
    } catch (error) {
      return {error: error.message}
    }
  }

  /**
   * 获取所有可用的端点
   */
  getAvailableEndpoints() {
    return this.endpoints.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      parameters: e.parameters
    }))
  }

  /**
   * 根据ID查找端点
   */
  findEndpointById(id) {
    return this.endpoints.find(e => e.id === id)
  }
}

// 导出单例实例
export default new GobanMCPEndpoints()

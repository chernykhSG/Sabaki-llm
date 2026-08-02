import EventEmitter from 'events'
import {getBoard} from '../../../modules/gametree.js'
import i18n from '../../../i18n.js'
import {
  moverSign,
  sideToMoveAt,
  toBlackWinrate,
  computeWinrateLoss,
  isSignificantMove
} from './gameReviewMath.js'
import {resolveEngineSyncer, analyzePosition} from '../mcp/pluginEngineAdapter.js'

const t = i18n.context('GameReviewer')

const DEFAULT_VISITS = 100
const DEFAULT_THRESHOLD = 8

export const REVIEW_STATUS = {
  DONE: 'done',
  CANCELLED: 'cancelled',
  STOPPED: 'stopped'
}

export {moverSign, sideToMoveAt, toBlackWinrate, computeWinrateLoss, isSignificantMove}

function vertexToCoord(board, vertex) {
  if (vertex == null || vertex[0] < 0 || vertex[1] < 0) return 'pass'
  return board.stringifyVertex(vertex)
}

// Проходит по списку узлов основной линии (nodes[0] — корень) и находит ходы,
// на которых winrate игрока, сделавшего ход, упал больше порога.
export class GameReview extends EventEmitter {
  constructor() {
    super()
    this.cancelled = false
    this.results = []
  }

  cancel() {
    this.cancelled = true
  }

  async start(tree, nodes, {threshold = DEFAULT_THRESHOLD, visits = DEFAULT_VISITS} = {}) {
    let resolved = resolveEngineSyncer()

    if (!resolved) {
      let error = {message: t('KataGo engine is not configured.')}
      this.emit('error', error)
      this.emit('done', {status: REVIEW_STATUS.STOPPED, results: this.results})
      return this.results
    }

    let {syncer, ownsSyncer} = resolved
    let board = getBoard(tree, nodes[0].id)
    let blackWinrates = new Array(nodes.length).fill(null)
    let bestVertices = new Array(nodes.length).fill(null)

    for (let i = 0; i < nodes.length; i++) {
      if (this.cancelled) {
        this.emit('done', {status: REVIEW_STATUS.CANCELLED, results: this.results})
        if (ownsSyncer) await syncer.stop()
        return this.results
      }

      this.emit('progress', {current: i + 1, total: nodes.length})

      let side = sideToMoveAt(nodes, i)
      let analysis = null

      try {
        analysis = await analyzePosition(syncer, tree, nodes[i].id, visits)
      } catch (err) {
        analysis = null
      }

      if (analysis == null) {
        this.emit('move-error', {index: i, nodeId: nodes[i].id})
        continue
      }

      blackWinrates[i] = toBlackWinrate(analysis.winrate, side)
      bestVertices[i] = analysis.bestVertex
    }

    for (let i = 1; i < nodes.length; i++) {
      let mover = moverSign(nodes[i])
      if (mover == null) continue

      let before = blackWinrates[i - 1]
      let after = blackWinrates[i]
      if (before == null || after == null) continue

      let loss = computeWinrateLoss(before, after, mover)

      let entry = {
        nodeId: nodes[i].id,
        moveIndex: i,
        sign: mover,
        winrateBefore: mover > 0 ? before : 100 - before,
        winrateAfter: mover > 0 ? after : 100 - after,
        loss,
        suggestedVertex: bestVertices[i - 1],
        suggestedCoord: vertexToCoord(board, bestVertices[i - 1])
      }

      this.results.push(entry)

      if (isSignificantMove(loss, threshold)) {
        this.emit('move-flagged', entry)
      }
    }

    if (ownsSyncer) await syncer.stop()

    this.emit('done', {status: REVIEW_STATUS.DONE, results: this.results})
    return this.results
  }
}

export function startReview(tree, nodes, options) {
  let review = new GameReview()
  review.start(tree, nodes, options)
  return review
}

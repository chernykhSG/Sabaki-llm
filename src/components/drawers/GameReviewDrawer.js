import * as remote from '@electron/remote'
import {h, Component} from 'preact'
import classNames from 'classnames'

import i18n from '../../i18n.js'
import sabaki from '../../modules/sabaki.js'
import {startReview} from '../../modules/gameReviewer.js'

import Drawer from './Drawer.js'

const t = i18n.context('GameReviewDrawer')
const setting = remote.require('./setting')

function formatWinrate(value) {
  return value == null ? '–' : `${value.toFixed(1)}%`
}

class ResultRow extends Component {
  render({entry, onClick}) {
    let {moveIndex, sign, winrateBefore, winrateAfter, loss, suggestedCoord} =
      entry

    return h(
      'tr',
      {onClick: () => onClick(entry.nodeId), class: 'game-review-row'},
      h('td', {}, moveIndex),
      h('td', {}, sign > 0 ? t('Black') : t('White')),
      h('td', {}, formatWinrate(winrateBefore)),
      h('td', {}, formatWinrate(winrateAfter)),
      h('td', {class: 'loss'}, `-${loss.toFixed(1)}%`),
      h('td', {}, suggestedCoord)
    )
  }
}

export default class GameReviewDrawer extends Component {
  constructor() {
    super()

    this.state = {
      running: false,
      progress: null,
      results: [],
      status: null,
      error: null
    }

    this.review = null
    this.reviewTree = null
    this.flaggedEntries = []

    this.handleStartClick = () => this.startReview()
    this.handleCancelClick = () => {
      if (this.review) this.review.cancel()
    }
    this.handleCloseButtonClick = evt => {
      evt.preventDefault()
      sabaki.closeDrawer()
    }
    this.handleRowClick = nodeId => {
      if (this.reviewTree == null) return
      sabaki.setCurrentTreePosition(this.reviewTree, nodeId)
    }
  }

  componentWillUnmount() {
    if (this.review) this.review.cancel()
  }

  startReview() {
    let {gameTrees, gameIndex, gameCurrents} = sabaki.state
    let tree = gameTrees[gameIndex]
    let nodes = [...tree.listCurrentNodes(gameCurrents[gameIndex])]

    if (nodes.length < 2 || this.state.running) return

    this.reviewTree = tree
    this.flaggedEntries = []

    let threshold = setting.get('review.winrate_drop_threshold')
    let visits = setting.get('review.visits')

    let review = startReview(tree, nodes, {threshold, visits})
    this.review = review

    this.setState({
      running: true,
      progress: {current: 0, total: nodes.length - 1},
      results: [],
      status: null,
      error: null
    })

    review.on('progress', ({current, total}) => {
      this.setState({progress: {current, total: total - 1}})
    })

    review.on('move-flagged', entry => {
      this.flaggedEntries.push(entry)
      this.setState({results: [...this.flaggedEntries]})
    })

    review.on('error', error => this.setState({error: error.message}))

    review.on('done', ({status}) => {
      this.setState({running: false, status})
      this.review = null
      this.applyMarkers()
    })
  }

  applyMarkers() {
    if (this.reviewTree == null || this.flaggedEntries.length === 0) return

    let tree = this.reviewTree
    let entries = this.flaggedEntries

    let newTree = tree.mutate(draft => {
      for (let entry of entries) {
        let node = draft.get(entry.nodeId)
        if (node == null) continue

        let point = node.data.B != null ? node.data.B[0] : node.data.W != null ? node.data.W[0] : null
        if (point == null || point === '') continue

        draft.addToProperty(entry.nodeId, 'TR', point)
        draft.updateProperty(entry.nodeId, 'BM', ['1'])
      }
    })

    this.reviewTree = newTree
    sabaki.setCurrentTreePosition(newTree, sabaki.state.treePosition)
  }

  render({show}, {running, progress, results, status, error}) {
    return h(
      Drawer,
      {
        type: 'game-review',
        show
      },

      h('h2', {}, t('Game Review')),

      h(
        'p',
        {class: 'game-review-description'},
        t(
          'Analyzes every move of the loaded game with KataGo and flags moves where the winrate dropped past the configured threshold.'
        )
      ),

      error != null && h('p', {class: 'game-review-error'}, error),

      running &&
        progress != null &&
        h(
          'p',
          {class: 'game-review-progress'},
          t(p => `Move ${p.current} of ${p.total}`, progress)
        ),

      !running &&
        status != null &&
        h(
          'p',
          {class: 'game-review-status'},
          status === 'cancelled'
            ? t('Review cancelled.')
            : status === 'stopped'
            ? t('Review stopped.')
            : t(p => `Review complete. ${p.count} significant move(s) found.`, {
                count: results.length
              })
        ),

      results.length > 0 &&
        h(
          'table',
          {class: 'game-review-table'},
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, t('#')),
              h('th', {}, t('Player')),
              h('th', {}, t('Before')),
              h('th', {}, t('After')),
              h('th', {}, t('Drop')),
              h('th', {}, t('Suggested'))
            )
          ),
          h(
            'tbody',
            {},
            ...results.map(entry =>
              h(ResultRow, {entry, onClick: this.handleRowClick})
            )
          )
        ),

      h(
        'form',
        {},
        h(
          'p',
          {},
          !running &&
            h(
              'button',
              {
                type: 'button',
                onClick: this.handleStartClick
              },
              t('Start Review')
            ),

          running &&
            h(
              'button',
              {
                type: 'button',
                class: 'warning',
                onClick: this.handleCancelClick
              },
              t('Cancel Review')
            ),
          ' ',

          h('button', {onClick: this.handleCloseButtonClick}, t('Close'))
        )
      )
    )
  }
}

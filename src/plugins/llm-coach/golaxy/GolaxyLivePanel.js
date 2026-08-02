import {h, Component} from 'preact'
import i18n from '../../../i18n.js'
import {getLiveReports, syncGolaxyOrYikeLizban, golaxy} from './golaxy.js'

export default class GolaxyLivePanel extends Component {
  constructor(props) {
    super(props)
    this.state = {
      liveGames: [],
      searchQuery: '',
      isLoading: false,
      selectedGame: null,
      isSyncing: false,
      isSyncButtonClicked: false,
      syncingGameId: null,
      lastMove: null
    }
  }

  async componentDidMount() {
    await this.fetchLiveGames()
  }

  async fetchLiveGames() {
    this.setState({isLoading: true})
    const games = await getLiveReports(this.state.searchQuery)
    this.setState({liveGames: games})
    this.setState({isLoading: false})
  }

  handleSearch = e => {
    this.setState({searchQuery: e.target.value})
  }

  handleSearchSubmit = async e => {
    e.preventDefault()
    await this.fetchLiveGames()
  }

  handleGameSelect = game => {
    this.setState({selectedGame: game})
  }

  handleSyncToBoard = async () => {
    if (!this.state.selectedGame) return

    const game_id = this.state.selectedGame.liveId

    this.setState({syncingGameId: game_id, isSyncButtonClicked: true})

    const url = `${golaxy.golaxyLiveUrl}/${game_id}`
    const sgfContent = await golaxy.getSgfByGolaxy(url)

    if (sgfContent) {
      await golaxy.syncSgf(game_id, sgfContent)
    }
  }

  handleStopSync = () => {
    golaxy.stopSync()
    this.setState({selectedGame: null})
    this.setState({isSyncing: false})
    this.setState({isSyncButtonClicked: false})
    this.setState({syncingGameId: null})
    this.setState({lastMove: null})
  }

  syncLiveGame = async (is_live = true) => {
    const game_id = this.state.selectedGame.liveId
    await syncGolaxyOrYikeLizban([game_id], is_live)
    const [
      game,
      title,
      PB,
      PW,
      RE,
      DT,
      totalMoves,
      lastMove
    ] = golaxy.getPropsBySgfStr(golaxy.sgf)
    this.setState({lastMove})
    if (RE === 'Unknown Result') {
      golaxy.startSync(game_id, totalMoves, lastMove, PB, PW)
      this.setState({isSyncing: true})
    }
  }

  render() {
    const {
      liveGames,
      searchQuery,
      isLoading,
      selectedGame,
      isSyncing
    } = this.state

    return h('div', {className: 'golaxy-live-panel'}, [
      h('div', {className: 'panel-header'}, [
        h(
          'form',
          {onSubmit: this.handleSearchSubmit, className: 'search-form'},
          [
            h('input', {
              type: 'text',
              value: searchQuery,
              onChange: this.handleSearch,
              placeholder: i18n.t('golaxy', 'Search players or events'),
              className: 'search-input'
            }),
            h(
              'button',
              {type: 'submit', className: 'search-button'},
              i18n.t('golaxy', 'Search')
            )
          ]
        )
      ]),

      isLoading
        ? h('div', {className: 'loading'}, i18n.t('golaxy', 'Loading...'))
        : h('div', {className: 'games-list'}, [
            liveGames.length > 0
              ? liveGames.map(game =>
                  h(
                    'div',
                    {
                      key: game.id,
                      className:
                        'game-item ' +
                        (selectedGame && selectedGame.id === game.id
                          ? 'selected'
                          : ''),
                      onClick: () => this.handleGameSelect(game)
                    },
                    [
                      h('div', {className: 'game-info'}, [
                        h(
                          'div',
                          {className: 'game-title'},
                          game.name || i18n.t('golaxy', 'Unnamed game')
                        ),
                        h('div', {className: 'players'}, [
                          h('span', {className: 'black-player'}, game.pb),
                          h('span', {}, ' vs '),
                          h('span', {className: 'white-player'}, game.pw)
                        ]),
                        h(
                          'div',
                          {className: 'game-status'},
                          [
                            h(
                              'span',
                              {},
                              (game.moveNum ? game.moveNum : 0) +
                                i18n.t('golaxy', 'Move')
                            ),
                            game.liveStatus === 0
                              ? h(
                                  'span',
                                  {className: 'live-indicator'},
                                  `(${i18n.t('golaxy', 'Live')}${
                                    this.state.syncingGameId === game.id &&
                                    this.state.lastMove
                                      ? `, ${i18n.t('golaxy', 'New move')}: ${
                                          this.state.lastMove
                                        }`
                                      : ''
                                  })`
                                )
                              : h(
                                  'span',
                                  {className: ''},
                                  `(${game.gameResult})`
                                )
                          ].filter(Boolean)
                        )
                      ])
                    ]
                  )
                )
              : h(
                  'div',
                  {className: 'no-games'},
                  i18n.t('golaxy', 'No matching games found')
                )
          ]),

      h('div', {className: 'action-buttons'}, [
        selectedGame
          ? [
              h(
                'button',
                {
                  className: 'sync-button',
                  onClick: this.state.isSyncButtonClicked
                    ? isSyncing
                      ? this.handleStopSync
                      : this.syncLiveGame
                    : this.handleSyncToBoard
                },
                i18n.t(
                  'golaxy',
                  this.state.isSyncButtonClicked
                    ? isSyncing
                      ? 'Stop sync'
                      : 'Start sync'
                    : 'Sync to board'
                )
              ),
              h(
                'button',
                {
                  className: 'refresh-button',
                  onClick: () => this.fetchLiveGames()
                },
                i18n.t('golaxy', 'Refresh list')
              )
            ].filter(Boolean)
          : h(
              'button',
              {
                className: 'refresh-button',
                onClick: () => this.fetchLiveGames()
              },
              i18n.t('golaxy', 'Refresh list')
            )
      ])
    ])
  }
}

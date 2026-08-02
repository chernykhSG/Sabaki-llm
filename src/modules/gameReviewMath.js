// Чистые функции для разбора партии — без зависимостей от Electron/Sabaki,
// чтобы их можно было напрямую require()-ить из юнит-тестов (см. test/).

function moverSign(node) {
  if (node.data.B != null) return 1
  if (node.data.W != null) return -1
  return null
}

function initialSideToMove(rootNode) {
  if (rootNode.data.PL != null && rootNode.data.PL[0] != null) {
    return rootNode.data.PL[0].toUpperCase() === 'W' ? -1 : 1
  }

  if (
    rootNode.data.AB != null &&
    rootNode.data.AB.length > 0 &&
    rootNode.data.AW == null
  ) {
    // Форовая партия: первым ходит белый
    return -1
  }

  return 1
}

function sideToMoveAt(nodes, index) {
  if (index === 0) return initialSideToMove(nodes[0])

  let mover = moverSign(nodes[index])
  return mover == null ? sideToMoveAt(nodes, index - 1) : -mover
}

function toBlackWinrate(rawWinrate, sideToMove) {
  return sideToMove > 0 ? rawWinrate : 100 - rawWinrate
}

function computeWinrateLoss(blackWinrateBefore, blackWinrateAfter, mover) {
  return mover > 0
    ? blackWinrateBefore - blackWinrateAfter
    : blackWinrateAfter - blackWinrateBefore
}

function isSignificantMove(loss, threshold) {
  return loss != null && loss >= threshold
}

module.exports = {
  moverSign,
  initialSideToMove,
  sideToMoveAt,
  toBlackWinrate,
  computeWinrateLoss,
  isSignificantMove
}

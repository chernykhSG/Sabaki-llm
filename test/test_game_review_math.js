// Юнит-тест чистых функций разбора партии (src/modules/gameReviewMath.js).
// В отличие от большинства файлов в test/, этот действительно require()-ит
// исходный модуль (а не текст файла) и падает с ненулевым кодом выхода при
// провале assert — так его подхватывает run_tests.js.

const assert = require('assert')
const path = require('path')

const {
  moverSign,
  initialSideToMove,
  sideToMoveAt,
  toBlackWinrate,
  computeWinrateLoss,
  isSignificantMove
} = require(path.join(__dirname, '..', 'src', 'modules', 'gameReviewMath.js'))

function node(data) {
  return {data}
}

console.log('=== moverSign ===')
assert.strictEqual(moverSign(node({B: ['pd']})), 1)
assert.strictEqual(moverSign(node({W: ['dp']})), -1)
assert.strictEqual(moverSign(node({})), null)
console.log('OK')

console.log('=== initialSideToMove ===')
assert.strictEqual(initialSideToMove(node({})), 1, 'по умолчанию первым ходит чёрный')
assert.strictEqual(
  initialSideToMove(node({PL: ['W']})),
  -1,
  'PL[W] отдаёт ход белому'
)
assert.strictEqual(
  initialSideToMove(node({AB: ['pd', 'dp']})),
  -1,
  'форовая партия (AB без AW) — первым ходит белый'
)
assert.strictEqual(
  initialSideToMove(node({AB: ['pd'], AW: ['dp']})),
  1,
  'AB+AW вместе — не фора, первым чёрный'
)
console.log('OK')

console.log('=== sideToMoveAt ===')
const nodes = [
  node({}), // корень
  node({B: ['pd']}), // ход 1 — чёрный
  node({W: ['dp']}), // ход 2 — белый
  node({B: ['qf']}) // ход 3 — чёрный
]
assert.strictEqual(sideToMoveAt(nodes, 0), 1, 'до хода 1 ходит чёрный')
assert.strictEqual(sideToMoveAt(nodes, 1), -1, 'после хода 1 (чёрного) ходит белый')
assert.strictEqual(sideToMoveAt(nodes, 2), 1, 'после хода 2 (белого) ходит чёрный')
assert.strictEqual(sideToMoveAt(nodes, 3), -1, 'после хода 3 (чёрного) ходит белый')
console.log('OK')

console.log('=== toBlackWinrate ===')
assert.strictEqual(toBlackWinrate(70, 1), 70, 'ход чёрного — winrate уже от лица чёрного')
assert.strictEqual(toBlackWinrate(70, -1), 30, 'ход белого — winrate инвертируется')
console.log('OK')

console.log('=== computeWinrateLoss ===')
assert.strictEqual(
  computeWinrateLoss(60, 40, 1),
  20,
  'чёрный сходил, его winrate (=blackWinrate) упал на 20 — потеря 20'
)
assert.strictEqual(
  computeWinrateLoss(60, 80, -1),
  20,
  'blackWinrate вырос на 20 после хода белого => winrate белого упал на 20'
)
assert.strictEqual(
  computeWinrateLoss(60, 65, 1),
  -5,
  'чёрный улучшил свою позицию — потеря отрицательная (не ошибка)'
)
console.log('OK')

console.log('=== isSignificantMove ===')
assert.strictEqual(isSignificantMove(10, 8), true, '10% >= порога 8% — значимый ход')
assert.strictEqual(isSignificantMove(5, 8), false, '5% < порога 8% — не значимый')
assert.strictEqual(isSignificantMove(null, 8), false, 'нет данных — не значимый')
console.log('OK')

console.log('\nВсе проверки gameReviewMath.js пройдены успешно.')

module Example {
  action StartInCorner = true
  action Win = true
  action Block = true
  action TakeCenter = true
  action SetupWin = true
  action MoveToEmpty(player) = true

  val boardEmpty = true
  val canWin = true
  val canBlock = true
  val canTakeCenter = true
  val canSetupWin = true
  val X = 1
  val O = 2
  var nextTurn: int
  val gameOver = false

  action MoveX = all {
    nextTurn == X,
    not(gameOver),
    if (boardEmpty) StartInCorner else
    if (canWin) Win else
    if (canBlock) Block else
    if (canTakeCenter) TakeCenter else
    if (canSetupWin) SetupWin else
    MoveToEmpty(X),
    nextTurn' = O,
  }
}

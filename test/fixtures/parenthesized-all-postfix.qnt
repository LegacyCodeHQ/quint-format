module ParenthesizedAllPostfix {
  var n: int

  run sequence = (all {
    n' = 1,
  }).then(all {
    n' = 2,
  })
}

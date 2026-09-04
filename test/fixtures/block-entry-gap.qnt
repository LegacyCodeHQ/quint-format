module Example {
  var n: int

  action step = all {
    n >= 0,

    n' = n + 1,
  }
}

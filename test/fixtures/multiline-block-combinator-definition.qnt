module Example {
  var n: int

  action step =
    all {
      n' = n,
      n >= 0,
    }
}

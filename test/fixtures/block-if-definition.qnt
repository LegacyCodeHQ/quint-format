module Example {
  var ready: bool
  var n: int

  action step =
    if (ready) {
      n' = n
    } else {
      n' = n + 1
    }
}

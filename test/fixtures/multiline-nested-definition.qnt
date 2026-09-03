module Example {
  var n: int

  action step =
    nondet value = Set(1, 2, 3).oneOf()
    all {
      n' = value,
      value > 0,
    }
}

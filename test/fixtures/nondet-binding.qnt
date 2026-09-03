module Example {
  var count: int

  action step = {
    nondet  choice=Set(1, 2).oneOf()
    count' = choice
  }
}

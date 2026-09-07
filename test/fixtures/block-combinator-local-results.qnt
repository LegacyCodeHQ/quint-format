module Example {
  pure def single = and {
    pure def value =
      1 + 2
    assert(value == 3)
  }

  pure def chained = and {
    pure def left =
      1 + 2
    pure def right =
      3 + 4
    assert(left < right),
  }
}

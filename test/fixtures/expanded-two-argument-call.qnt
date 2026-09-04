module Example {
  pure def compare(left, right) = true

  pure val result =
    compare(
      { prefix: [1], suffix: [4, 5, 6] },
      { prefix: [2, 7, 8, 9], suffix: [] }
    )
}

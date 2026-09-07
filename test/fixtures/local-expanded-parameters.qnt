module Example {
  pure def check(values: Set[int]): bool = {
    pure def includesExpected(
      items: Set[int],
      expected: int,
    ): bool =
        items.contains(expected)
    includesExpected(values, 1)
  }
}

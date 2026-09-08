module Example {
  pure def total(values: Set[int]): int = {
    pure val selected =
        values.filter(value => value > 0)
    selected.fold(0, (sum, value) => sum + value)
  }
}

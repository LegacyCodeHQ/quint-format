module Example {
  pure def check(values: Set[int]): bool = {
    values.size() > 0 implies
      values.forall(value => {
        val positive = value > 0
        positive
      })
  }
}

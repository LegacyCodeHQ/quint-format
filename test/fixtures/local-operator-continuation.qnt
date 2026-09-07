module Example {
  pure def check(values: Set[int]): bool = {
    pure def allPositive(items: Set[int]): bool =
      items.forall(element =>
        element > 0)
    allPositive(values)
  }
}

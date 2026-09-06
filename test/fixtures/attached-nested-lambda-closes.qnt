module Example {
  pure def allDistinct(values: List[int]): bool =
    values.forall(a =>
      values.forall(b =>
        (a != b) implies values.contains(a)))
}

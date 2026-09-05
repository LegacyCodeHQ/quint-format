module Example {
  pure def update(values: Set[int]): Set[int] =
    values.fold(Set(), (result, value) =>
        if (value > 0 and value > 1 and value > 2 and value > 3 and value > 4 and value > 5 and value > 6 and value > 7 and value > 8)
          val updated = result.union(Set(value))
          updated
        else
          result
    )
}

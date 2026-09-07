module Example {
  pure def maximum(values: List[int]): int =
      values.foldl(0, (largest, value) =>
        if (value > largest)
          value
        else
          largest)
}

module Example {
  pure def maximum(values: List[int]): int = {
    val result = values
      .fold(0, (largest, value) =>
        if (value > largest) value else largest)

    result
  }
}

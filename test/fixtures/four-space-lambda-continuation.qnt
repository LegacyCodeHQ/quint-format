module Example {
  pure val total = Set(1).fold(0, (sum, value) =>
      sum + value)
}

module Example {
  pure def choose(value: int): int = // Preserve the source-line annotation
    if (value > 0) {
      value
    } else {
      0
    }
}

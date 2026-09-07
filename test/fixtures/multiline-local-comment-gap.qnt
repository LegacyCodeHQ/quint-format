module Example {
  pure def build = {
    val values = Set(1).fold(Set(), (acc, value) =>
        acc.union(Set(value)))
    // Continue with the collected values.
    // Preserve the complete explanatory block.
    values
  }
}

module Example {
  pure def build = {
    val values = Set(1).fold(Set(), (acc, value) =>
      acc.union(Set(value)))
    // Return the collected values.
    values
  }
}

module Example {
  pure def calculate(value: int): int = {
    pure val doubled = value * 2

    doubled + 1
  }
}

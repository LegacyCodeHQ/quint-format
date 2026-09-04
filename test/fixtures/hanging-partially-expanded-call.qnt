module Example {
  pure def combine(first: int, second: int, third: int, fourth: int, fifth: int): int =
    first + second + third + fourth + fifth

  pure val result = combine(1, 2, 3,
      4, 5)
}

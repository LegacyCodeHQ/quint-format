module Example {
  pure def check = {
    pure def isPositive(n: int) : bool = n > 0
    isPositive(1)
  }
}

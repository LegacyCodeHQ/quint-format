module Example {
  pure def app(op: (int, int) => int, lhs: int, rhs: int): int = op(lhs, rhs)

  pure def absoluteDifference(lhs: int, rhs: int): int =
    ((x, y) => {
      val result = x - y
      if (result < 0) -result else result
    }).app(lhs, rhs)
}

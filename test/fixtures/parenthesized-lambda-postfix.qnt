module Example {
  type UIntT = Ok(int) | Err(str)
  const MAX: int

  pure def app(op: (int, int) => int, lhs: UIntT, rhs: UIntT, errMsg: str): UIntT = Ok(0)

  pure def saturatingAdd(lhs: UIntT, rhs: UIntT): UIntT =
    ((x, y) =>
      val res = x + y
      if (res < MAX) res else MAX)
    .app(lhs, rhs, "impossible")
}

module Example {
  type UIntT = Ok(int) | Err(str)

  pure def bind(result: UIntT, callback: int => UIntT): UIntT =
    match result {
      | Ok(value) => callback(value)
      | Err(_) => result
    }

  pure def isInRange(value: int): bool = value >= 0

  pure def app(op: (int, int) => int, lhs: UIntT, rhs:UIntT, errMsg: str): UIntT =
    lhs.bind(x => rhs.bind(y =>
      val res = op(x, y)
      if (isInRange(res)) Ok(res) else Err(errMsg)))
}

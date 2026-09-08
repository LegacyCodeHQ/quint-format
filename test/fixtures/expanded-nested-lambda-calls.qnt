module Example {
  type UIntT = Ok(int) | Err(str)

  pure def bind(result: UIntT, callback: int => UIntT): UIntT =
    match result {
      | Ok(value) => callback(value)
      | Err(_) => result
    }

  pure def checkedDiv(lhs: UIntT, rhs: UIntT): UIntT =
    lhs.bind(
      l => rhs.bind(
      r =>
        if (r == 0)
          Err("division by zero")
        else
          Ok(l / r)))
}

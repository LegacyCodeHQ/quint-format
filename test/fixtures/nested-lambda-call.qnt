module Example {
  type Result = | Ok(int) | Err(str)

  pure def bind(result: Result, callback: int => Result): Result =
    match result {
      | Ok(value) => callback(value)
      | Err(_) => result
    }

  pure def combine(lhs: Result, rhs: Result): Result =
    lhs.bind(
      left => rhs.bind(
      right =>
      if (left == right)
        Ok(left)
      else
        Err("different")))
}

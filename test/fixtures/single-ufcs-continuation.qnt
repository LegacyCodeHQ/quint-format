module Example {
  pure def ensure(condition: bool, message: str): str = if (condition) "" else message
  pure def andEnsure(previous: str, condition: bool, message: str): str =
    if (previous != "") previous else ensure(condition, message)

  pure val error = ensure(true, "first message")
    .andEnsure(false, "second message")
}

module Example {
  pure def classify(value: int): str =
    if ((value == 0)
      or value == 1) "SUCCESS"
    else "NOT_ENOUGH_TRUST"
}

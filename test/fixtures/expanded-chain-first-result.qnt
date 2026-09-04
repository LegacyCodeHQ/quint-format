module Example {
  pure def classify(value: int): str =
    if (value < 0) "NEGATIVE"
    else if (value == 0)
      "ZERO"
    else
      "POSITIVE"
}

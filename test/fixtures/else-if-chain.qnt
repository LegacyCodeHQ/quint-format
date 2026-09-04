module Example {
  pure def classify(value: int): str =
    if (value < 0)
      "negative"
    else
      if (value == 0)
        "zero"
      else
        "positive"
}

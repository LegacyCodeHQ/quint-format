module Example {
  pure def classify(value: int): { label: str, result: int } = {
    if (value > 0) {
      label: "positive",
      result: value,
    } else if (value < 0) {
      label: "negative",
      result: value,
    } else {
      label: "zero",
      result: value,
    }
  }
}

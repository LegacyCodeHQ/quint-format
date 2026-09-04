module Example {
  var values: str -> int

  action update = {
    values' = values.setBy("one", value =>
      value + 1
    )
  }
}

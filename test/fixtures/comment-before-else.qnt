module Example {
  pure def result(first: bool, second: bool): str =
    if (first) "FIRST"
    else if (second)
      "SECOND"
    // Explain the final fallback.
    else
      "THIRD"
}

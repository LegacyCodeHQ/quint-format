module Example {
  pure def choose(flag: bool): int = {
    val selected =
        if (flag) 1
        // fallback result
        else 2
    selected
  }
}

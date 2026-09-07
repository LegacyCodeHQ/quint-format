module Example {
  pure val selected =
    Set(1, 2, 3).filter(value => value > 1)

  pure def countSelected(): int = {
    pure val localSelected =
      selected.filter(value => value < 3)
    localSelected.size()
  }
}

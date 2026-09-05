module Example {
  pure def verify(first: int, second: int): bool = true

  pure def valid(state: str): bool =
      state != "working" implies verify(
          1,
          2
      )
}

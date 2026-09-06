module Example {
  pure def choose(a: bool, b: bool, c: bool, d: bool): bool =
    if(
        (a and b)
        and (c and d)
      )
      true
    else
      false
}

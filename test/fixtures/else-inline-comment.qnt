module Example {
  const inner: int

  val result =
    if (inner == 2)
      1
    else // inner is not 2
      if (inner == 3)
        2
      else
        3
}

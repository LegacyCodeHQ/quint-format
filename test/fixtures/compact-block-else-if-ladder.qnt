module Example {
  type Ordering = LT | GT | EQ

  pure def intCompare(__a: int, __b:int): Ordering = {
    if (__a < __b)
      { LT }
    else if (__a > __b)
      { GT }
    else
      { EQ }
  }
}

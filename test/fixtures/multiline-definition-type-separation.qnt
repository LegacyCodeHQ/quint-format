module Example {
  type Ordering = LT | GT | EQ

  /// Comparison of integers
  pure def intCompare(__a: int, __b:int): Ordering = {
    if (__a < __b)
      { LT }
    else if (__a > __b)
      { GT }
    else
      { EQ }
  }
  type NodeIdToCompare = {
    version: int,
    key_hash: List[int]
  }
}

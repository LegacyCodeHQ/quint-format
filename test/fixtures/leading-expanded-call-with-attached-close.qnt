module Example {
  pure def listContains(__list: List[a], __elem: a): bool =
    __list.foldl(
      false,
      (__acc, __i) => __acc or __i == __elem)
}

module Example {
  pure def listForall(list: List[a], pred: a => bool): bool = {
    list.foldl(true, (result, element) => { if (pred(element)) result else false })
  }
}

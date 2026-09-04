module Example {
  pure def sort(values: List[int]): List[int] = {
    pure def appendOne(items: List[int]): List[int] = {
      items.append(1)
    }

    appendOne(values)
  }
}

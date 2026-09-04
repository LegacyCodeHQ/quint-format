module Example {
  pure val decreased: List[int] = [ 1, 2, 3 ].foldl([],
      (list, value) => list.append(if (value >= 0) value else (value - 1))
  )
}

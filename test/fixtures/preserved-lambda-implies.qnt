module Example {
  pure val valid = Set(1, 2).forall(value =>
    (value > 0)
      implies (value >= 1)
  )
}

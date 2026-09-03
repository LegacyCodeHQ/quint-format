module Example {
  var selected: int

  action step =
    nondet choice =
      Set(1, 2, 3)
        .filter(value => value > 1)
        .oneOf()
    selected' = choice
}

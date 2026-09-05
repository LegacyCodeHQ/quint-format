module Example {
  action init = true
  action step(values: Set[int]): bool = true

  run execution =
    init
       // Explain the first transition.
       // Keep this attached to the call.
      .then(step(Set(
        1,
        2
        )))
}

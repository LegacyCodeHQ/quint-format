module Example {
  action init = true
  action step = true

  run execution =
    init
        // Explain the first transition.
        // Keep this attached to the call.
        .then(step)
}

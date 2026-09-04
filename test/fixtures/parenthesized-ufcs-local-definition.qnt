module Example {
  action init = true
  action step(value) = true

  run scenario =
    init.then(step(0))
        .then(
          val value = 1
          step(value)
        ).then(step(2))
}

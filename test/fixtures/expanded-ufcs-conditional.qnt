module Example {
  val ready = true
  action init = true
  action first = true
  action second = true

  action result =
    init.then(first)
      .then(
        if (ready) {
          first
        } else {
          second
        }
      )
}

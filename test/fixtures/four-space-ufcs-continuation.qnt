module Example {
  var states: str -> int

  action step = {
    nondet key = Set("one")
                           .oneOf()
    val updated = states
                      .set(key, 1)
    states' = states
               .set(key, updated.get(key))
  }
}

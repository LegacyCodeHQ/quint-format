module Example {
  type State = { first: int, second: int }
  var state: State

  action update = all {
    state' =
      state.with("first", 1)
        .with("second", 2),
  }
}

module Example {
  type State = { value: int }

  pure def update(condition: bool, state: State): State =
    if (condition) {
      value: state.value,
    } else
      pure val nextValue = state.value + 1
      {
        value: nextValue,
      }
}

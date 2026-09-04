module Example {
  pure def proposals(values) =
      values
          .map(value =>
            { id: value }
          )
}

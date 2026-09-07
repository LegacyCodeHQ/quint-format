module Example {
  pure def nested(values: Set[int]): bool =
      values.size() > 0 implies
          values.forall(value =>
            value > 0 implies
                values.exists(other => {
                  val same = other == value
                  same
                })
          )
}

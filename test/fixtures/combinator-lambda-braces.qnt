module Example {
  pure val values = Set(1, 2)

  val allCase = values.exists(value => all {
    value > 0,
    value < 3,
  })

  val anyCase = values.exists(value => any {
    value == 1,
    value == 2,
  })

  val andCase = values.exists(value => and {
    value > 0,
    value < 3,
  })

  val orCase = values.exists(value => or {
    value == 1,
    value == 2,
  })
}

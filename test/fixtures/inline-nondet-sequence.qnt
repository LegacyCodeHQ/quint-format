module Example {
  action use(value, amount) = true

  action step = any {
    nondet value = Set(1, 2, 3).oneOf(); use(value, value),
    all {
      nondet index = Set(1, 2, 3).oneOf(); nondet amount = Set(1, 2, 3).oneOf() use(index, amount),
    },
  }
}

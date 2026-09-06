module Example {
  run choose = {
    nondet value = Set(1).oneOf()

    val result = value + 1
    result == 2
  }
}

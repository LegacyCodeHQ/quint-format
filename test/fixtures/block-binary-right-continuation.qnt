module Example {
  pure val holds = and {
    1.in(Set(1, 2)) implies
        1 == 1,
  }
}

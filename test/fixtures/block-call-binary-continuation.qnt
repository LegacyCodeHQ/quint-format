module Example {
  run check =
    all {
      assert(Set(1, 2, 3).size()
          == 3),
      true
    }
}

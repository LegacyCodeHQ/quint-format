module Example {
  pure val holds = {
    val values = Set(1, 2)

    values.size() == 2 implies
        val selected = 1

        selected == 1
  }
}

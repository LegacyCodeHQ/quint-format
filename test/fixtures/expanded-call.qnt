module Example {
  pure val transferSequence = List(
    ("A", "B"),
    ("B", "C"),
    ("C", "A"),
    ("A", "C"),
    ("C", "B"),
    ("B", "A")
  )
}

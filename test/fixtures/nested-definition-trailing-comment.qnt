module Example {
  action step =
    nondet selected = Set(1, 2).oneOf() // Finish this choice.
    nondet dirty = Set(1, 2).oneOf()
    selected != dirty
}

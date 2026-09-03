module Example {
  const names: Set[str]

  val all_present = names.forall(name =>
    names.contains(name)
  )
}

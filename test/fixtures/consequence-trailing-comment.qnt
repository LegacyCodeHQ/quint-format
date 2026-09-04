module Example {
  const ready: bool

  val result =
    if (ready)
      { status: 1 } // Keep this with the first branch.
    else
      { status: 2 }
}

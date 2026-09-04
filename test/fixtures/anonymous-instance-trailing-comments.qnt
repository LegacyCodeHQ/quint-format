module Library {
  const A: int
  const B: int
}

module Example {
  import Library(
    A = 1,  // first override
    B = 2   // second override
  ).*
}

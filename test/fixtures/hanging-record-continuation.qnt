module Example {
  run test =
      assert(
          { nodes: 1, orphans: Set() }
              == { nodes: 1,
                orphans: Set() }
      )
}

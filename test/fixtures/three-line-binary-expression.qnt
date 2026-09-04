module Example {
  pure val holds = Set(1, 2).forall(first => {
    Set(1, 2).forall(second => {
      first == second
          implies
              first != 0
    })
  })
}

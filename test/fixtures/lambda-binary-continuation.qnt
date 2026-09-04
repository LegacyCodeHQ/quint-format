module Example {
  pure val chains = Set("a")

  pure val valid =
    chains.forall(chain =>
      chain != "b" implies
        chain == "a"
    )
}

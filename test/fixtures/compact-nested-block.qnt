module Example {
  pure val channelTopology = Map("A" -> "channelToA")

  run simulationTest = all {
    def show(a) = true { show(channelTopology) },
    true,
  }
}

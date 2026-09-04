module Example {
  pure val channelTopology = Map(
      "A" -> Map(
          "B" -> "channelToB",
          "C" -> "channelToC"
      ),
      "B" -> Map(
          "A" -> "channelToA",
          "C" -> "channelToC"
      ),
      "C" -> Map(
          "A" -> "channelToA",
          "B" -> "channelToB"
      )
  )
}

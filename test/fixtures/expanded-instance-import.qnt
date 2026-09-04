module Source {
  const possibleChannelTopologies: Set[str]
}

module Example {
  pure val myChannelNames = Set("channelToA", "channelToB")

  import Source(
    possibleChannelTopologies = myChannelNames
  ).*
}

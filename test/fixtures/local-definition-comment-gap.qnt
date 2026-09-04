module Example {
  pure def build = {
    pure val data = { value: 1 }

    // Construct the packet.
    pure val packet = { data: data }
    packet
  }
}

module Example {
  type State = {
    outPackets: Set[int],              // outgoing packets
    acknowledgements: Set[int]         // incoming acknowledgements
  }
}

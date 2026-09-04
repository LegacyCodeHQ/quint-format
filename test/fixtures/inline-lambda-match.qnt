module InlineLambdaMatch {
  type Message = Msg(int) | Other

  pure def values(messages: Set[Message]): Set[int] =
    messages.fold(Set(), (acc, message) => match message {
      | Msg(value) => acc.union(Set(value))
      | _          => acc
    })
}

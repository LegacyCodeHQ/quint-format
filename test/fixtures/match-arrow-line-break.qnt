module Example {
  type Node = Internal(int) | Leaf

  pure def value(node: Node): int =
    match node {
      | Internal(number)
         => number
      | Leaf => 0
    }
}

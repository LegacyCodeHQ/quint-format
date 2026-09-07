module Example {
  type Node = Leaf(int) | Internal(int)

  pure def is_leaf(n: Node) : bool =
    match n {
      | Leaf(n) => true
      | Internal(n) => false
    }
}

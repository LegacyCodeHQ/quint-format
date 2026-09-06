module Example {
  type Node = Internal(int) | Leaf(int)

  pure def sumInternals(nodes: List[Node]): int =
    nodes.foldl(0, (total, node) =>
      match node {
        | Internal(value) => total + value
        | Leaf(_) => total
      })
}

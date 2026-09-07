module Example {
  type Node = Leaf(int) | Internal(int)

  pure def complete(nodes: Set[Node]): bool =
      nodes.size() > 0 implies
          nodes.forall(node =>
              match node {
                | Leaf(n) => n > 0
                | Internal(_) => true
              }
          )
}

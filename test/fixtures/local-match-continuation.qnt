module Example {
  type Child = Some(int) | None
  type Node = Internal(Child) | Leaf

  pure def check(node: Node): bool =
      match node {
        | Internal(child) =>
            val childOK =
              match child {
                | Some(value) => value > 0
                | None => false
              }
            childOK
        | Leaf => true
      }
}

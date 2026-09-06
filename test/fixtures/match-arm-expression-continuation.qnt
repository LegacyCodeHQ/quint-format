module Example {
  type Node = Leaf({ key_hash: int }) | Internal(int)
  type Proof = Exist(int) | NonExist

  pure def evaluate(proof: Proof, nodes: Set[Node], k: int): bool =
    match proof {
      | Exist(ep) =>
          nodes.filter(n => match n {
            | Leaf(n) => n.key_hash == k
            | Internal(_) => false
          }).size() > 0
      | NonExist => true
    }
}

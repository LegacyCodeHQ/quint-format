module Example {
  type Inner = Leaf(int) | Internal(int)
  type Outer = Some(Inner) | None

  pure def evaluate(value: Outer): int = {
    match value {
      | Some(node) => match node {
          | Leaf(number) => number
          | Internal(number) => number + 1
        }
      | None => {
          0
        }
    }
  }
}

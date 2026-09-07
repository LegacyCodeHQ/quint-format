module Example {
  type Inner = Exist(int) | NonExist
  type Outer = Some(Inner) | None

  pure def verify(value: Outer): bool =
      match value {
        | Some(inner) =>
            match inner {
              | Exist(number) => number > 0
              | NonExist => true
            }
        | None => false
      }
}

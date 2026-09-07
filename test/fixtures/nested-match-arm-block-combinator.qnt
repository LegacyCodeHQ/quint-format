module Example {
  type Inner = Exist(int) | NonExist
  type Outer = Some(Inner) | None

  pure def verify(value: Outer): bool =
      match value {
        | Some(inner) =>
          match inner {
            | Exist(n) => and {
                n > 0,
                n < 10,
              }
            | NonExist => true
          }
        | None => false
      }
}

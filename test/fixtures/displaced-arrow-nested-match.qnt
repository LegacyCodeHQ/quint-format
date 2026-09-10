module Example {
  type Inner = Child(int) | NoInner
  type Outer = Parent(Inner) | Empty

  pure def value(outer: Outer): int =
      match outer {
        | Parent(inner)
            => match inner {
              | Child(number) => number
              | NoInner => 0
            }
        | Empty => 0
      }
}

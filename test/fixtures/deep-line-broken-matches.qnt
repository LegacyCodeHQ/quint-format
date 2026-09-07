module Example {
  type Third = Value(int) | NoThird
  type Second = More(Third) | NoSecond
  type First = Next(Second) | NoFirst

  pure def evaluate(first: First): int =
      match first {
        | Next(second) =>
          match second {
            | More(third) =>
              match third {
                | Value(number) => number
                | NoThird => 0
              }
            | NoSecond => 0
          }
        | NoFirst => 0
      }
}

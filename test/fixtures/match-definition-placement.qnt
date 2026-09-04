module Example {
  type Option = Some(int) | None

  pure def inline(value: Option): int = match value {
    | Some(result) => result
    | None => 0
  }

  pure def expanded(value: Option): int =
    match value {
      | Some(result) => result
      | None => 0
    }
}

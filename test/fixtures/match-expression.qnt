module Example {
  type Option = Some(int) | None

  pure def getOrZero(value: Option): int = match value {Some(x)=>x|None=>0|_=>0}
}

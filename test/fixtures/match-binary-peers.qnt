module Example {
  type Maybe = Some(int) | None

  pure def valid(left: Maybe, right: Maybe): bool = {
    match left {
      | None => true
      | Some(_) => false
    }
    and
    match right {
      | None => true
      | Some(_) => false
    }
  }
}

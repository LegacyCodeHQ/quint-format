module Example {
  type Status = Ready | Waiting
  var status: Status

  action step =
    match status {
      | Ready => { status' = Waiting }
      | Waiting => { status' = Ready }
    }
}

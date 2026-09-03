module Example {
  type Status = Ready | Waiting
  var status: Status
  var n: int

  action step =
    match status {
      | Ready => all {
        n' = n,
        status' = Waiting,
      }
      | Waiting => all {
        n' = n + 1,
        status' = Ready,
      }
    }
}

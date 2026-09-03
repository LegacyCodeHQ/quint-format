module Example {
  type Status = Ready | Waiting
  var status: Status

  val number =
    match status {
      | Ready =>
          1 // Ready has a value
      | Waiting => 0
    }
}

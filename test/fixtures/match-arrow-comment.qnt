module Example {
  type Mode = Ready | Waiting

  const mode: Mode

  val result = match mode {
    | Ready => 1
    | Waiting =>        // Explain this arm.
        2
  }
}

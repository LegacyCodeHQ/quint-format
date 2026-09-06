module Example {
  type Applied[a, b] = (a, b)

  type Context = Applied[
    int,
    bool
  ]
  /* End of boilerplate */

  pure def shouldProceed = true
}

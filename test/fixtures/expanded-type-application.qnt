module Example {
  type Applied[a, b, c, d, e] = (a, b, c, d, e)

  type GlobalContext = Applied[
      int,
      bool,
      str,
      int,
      bool
    ]
}

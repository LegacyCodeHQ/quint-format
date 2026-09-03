module Example {
  var n: int

  action init = n' = 0
  action step = n' = n + 1

  run trace =
    init.then(step)
        .then(step)
        .then(all {
          n' = n,
          assert(n >= 0),
        })
}

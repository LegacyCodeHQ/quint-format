module Example {
  pure val records = Set("one").mapBy(name => {
    name: name,
    count: 1
  })
}

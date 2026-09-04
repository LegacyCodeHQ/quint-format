module Example {
  pure val folded =
    0.range(8)
        .foldl(Map(),
          (m, key) =>
            if (key > 0) m.put(key, key) else m
        )
}

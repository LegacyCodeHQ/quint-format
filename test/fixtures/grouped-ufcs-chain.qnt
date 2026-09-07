module Example {
  pure val result =
      Set(1)
          .union(Set(2))

          .union(Set(3))

          // Keep the final operation in its own explained group.
          .union(Set(4))
}

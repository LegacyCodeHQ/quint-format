module Example {
  type Proof = Found(int) | Missing

  pure def verify(proof: Proof): bool =
      match proof {
        | Found(value) => {
            value > 0
          }
        | Missing => false
      }
}

module Example {
  type Outcome = Updated(int) | Deleted

  pure def evaluate(outcome) = if (outcome == Deleted) {
    { result: 0 }

  } else {
    match outcome {
      | Updated(number) => number
      | Deleted => 0
    }


  }
}

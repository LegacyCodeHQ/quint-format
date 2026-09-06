module Example {
  type Outcome = Updated(int) | Deleted

  pure def evaluate(outcome) = match outcome {
    | Updated(number) => {
        child: number,
        changed: true,
      }
    | Deleted => {
        child: 0,
        changed: false,
      }
  }
}

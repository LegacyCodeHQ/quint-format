module Example {
  type Optional = Some(int) | None
  type Outcome = Updated(int) | Unchanged(Optional)

  pure def evaluate(outcome, new_tree) = {
    match outcome {
      | Updated(number) => {
          ...new_tree,
          value: number,
        }
      | Unchanged(optional) => {
          match optional {
            | Some(number) => {
                ...new_tree,
                value: number,
              }
            | None => new_tree
          }
        }
      | _ => new_tree
    }
  }
}

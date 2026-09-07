module Example {
  action init = true
  action p2 = true
  action proposal = true
  action with_cue(process, cue) = process
  action perform(process) = process

  action result =
    init
      .then(p2
        .with_cue(proposal)
        .perform()
      )
}

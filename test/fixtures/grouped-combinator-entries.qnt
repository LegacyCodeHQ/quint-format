module Example {
  val groupedAll = all {
    true, true, true,
  }

  val groupedAny = any {
    true, false, true,
  }

  pure val groupedAnd = and {
    true, true, false,
  }

  pure val groupedOr = or {
    false, false, true,
  }

  pure val longGroup = and {
    "first deliberately long value for width testing" == "first deliberately long value for width testing", "second deliberately long value for width testing" == "second deliberately long value for width testing",
  }
}

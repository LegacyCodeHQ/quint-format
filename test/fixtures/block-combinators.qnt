module Example {
  var count: int

  action choose = any {count' = 1,count' = 2}

  action advance = all {count >= 0,count' = count + 1}

  pure val both = and {true,false}

  pure val either = or {false,true}
}

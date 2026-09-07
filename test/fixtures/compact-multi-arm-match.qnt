module sum {
  type T = None | Some(int)
  var x: T
  action init = x' = None
  action step = x' = match x { None => Some(1) | Some(n) => Some(n+1) }
}

module Example {
  pure def calculate(value: int): int = {
    pure   val doubled:int=value * 2;
    pure   def increment(number: int): int=number + 1;
    increment(doubled)
  }
}

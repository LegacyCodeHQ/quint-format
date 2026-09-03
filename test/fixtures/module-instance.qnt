module Library {
  const N: int
  const Flag: bool
}
module Example {
 import Library ( N=1 ,Flag=true, )  as   Lib
}

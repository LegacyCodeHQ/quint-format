module Library {
  const N: int
}
module Example {
 import Library ( N=1, ) . *
}

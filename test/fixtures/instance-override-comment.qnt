module Library{
const N:int
}
module Example{
import Library(
// Preserve this override comment.
N=1
)as Lib
}

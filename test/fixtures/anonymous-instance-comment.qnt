module Library{
const N:int
}
module Example{
import Library(
// Preserve this anonymous override comment.
N=1
).*
}

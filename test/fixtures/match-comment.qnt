module Example{
type Step=First|Second
pure def value(step)=match step{
// Preserve this arm comment.
|First=>1
|Second=>2
}
}

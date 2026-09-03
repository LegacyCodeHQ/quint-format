module Example{
type Step=First|Second
pure def value(step)=match step{
|First=>
// Preserve this arm body comment.
1
|Second=>2
}
}

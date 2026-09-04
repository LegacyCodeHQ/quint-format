module IndentedPostDeclarationComments {
var votes: str -> Set[(int, int)]
    // votes[a] is the set of votes cast by acceptor a
var maxBal: str -> int
    // maxBal[a] is a ballot number. Acceptor a will cast
    // further votes only in ballots numbered greater than maxBal[a]
}

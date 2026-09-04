module AlignedDeclarations {
  var maxBal:   str -> int
  var maxVBal:  str -> int // maxVBal and maxVal form the largest vote
  var maxVal:   str -> int  // or a sentinel value when the acceptor
                            // has not cast any vote.
}

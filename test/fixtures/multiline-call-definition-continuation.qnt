module Example {
  pure def buyableVia1Swap(someCoins) = someCoins

  pure def buyableNSwaps(someCoins, n) =
    1.to(n).fold(someCoins,
                 (prevCoins, i) => buyableVia1Swap(prevCoins))
}

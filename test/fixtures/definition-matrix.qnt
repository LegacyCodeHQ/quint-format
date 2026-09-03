module Matrix{
type Pair[a,b]=(a,b)
type Callback[a,b]=(a)=>b
var n:int
pure def identity(value:List[Set[int]]):List[Set[int]]=value
pure def apply(value:int,callback:(int)=>str):str=callback(value)
def stateValue(offset:int):int=n+offset
action advance(amount:int):bool=all{
amount>0,
n'=n+amount,
}
run scenario(start:int):bool=(n'=start).then(n'=start+1)
temporal positive(limit:int):bool=always(n>=limit)
nondet choose(values:Set[int]):int=values.oneOf()
}

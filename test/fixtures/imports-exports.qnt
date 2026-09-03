module Library {
  pure val value = 1
}
module Consumer {
 import   Library
 import Library  as   Lib
 import Library . value
 import Library . *
 export  Library
 export Library  as   Public
 export Library . value
 export Library . *
}

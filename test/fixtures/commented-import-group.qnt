module basics {
  pure val one = 1
}

module extras {
  pure val two = 2
}

module Example {
  // Import the basic definitions.
  import basics.*
  // Import the extra definitions.
  import extras.*
}

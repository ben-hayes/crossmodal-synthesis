function rbf(x, eps) {
  return Math.exp(-((eps * x) ** 2));
}

function repeatingRbf(x, eps, s) {
  return rbf((x % s) - 0.5 * s, eps);
}

function randomSubset(arr, n) {
  var result = new Array(n),
    len = arr.length,
    taken = new Array(len);
  if (n > len)
    throw new RangeError("getRandom: more elements taken than available");
  while (n--) {
    var x = Math.floor(Math.random() * len);
    result[n] = arr[x in taken ? taken[x] : x];
    taken[x] = --len in taken ? taken[len] : len;
  }
  return result;
}

function noteToFreq(note) {
  return 2 ** ((note - 69) / 12) * 440.0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { noteToFreq, randomSubset, rbf, repeatingRbf, sleep };

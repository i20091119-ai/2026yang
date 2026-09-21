// 소수/합성수 판정과 약수 쌍 선택
(function () {
  const primeCache = new Map();

  function isPrime(n) {
    if (n < 2) return false;
    if (primeCache.has(n)) return primeCache.get(n);
    let result = true;
    if (n % 2 === 0) result = n === 2;
    else {
      for (let d = 3; d * d <= n; d += 2) {
        if (n % d === 0) { result = false; break; }
      }
    }
    primeCache.set(n, result);
    return result;
  }

  // n의 자명하지 않은 약수 쌍 [a, b] (a <= b, a*b = n) 목록
  function factorPairs(n) {
    const pairs = [];
    for (let a = 2; a * a <= n; a++) {
      if (n % a === 0) pairs.push([a, n / a]);
    }
    return pairs;
  }

  function randomPair(n) {
    const pairs = factorPairs(n);
    if (pairs.length === 0) return null;
    return pairs[Math.floor(Math.random() * pairs.length)];
  }

  function primesUpTo(max) {
    const list = [];
    for (let i = 2; i <= max; i++) if (isPrime(i)) list.push(i);
    return list;
  }

  function compositesUpTo(max) {
    const list = [];
    for (let i = 4; i <= max; i++) if (!isPrime(i)) list.push(i);
    return list;
  }

  window.NumMath = { isPrime, factorPairs, randomPair, primesUpTo, compositesUpTo };
})();

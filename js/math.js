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

  // 균형 잡힌 쌍(두 약수가 가까운 것)을 우선 고른다. 16 → 4×4, 36 → 6×6, 12 → 3×4.
  // 다만 30% 정도는 다른 쌍도 나와서 여러 분해 방법을 볼 수 있게 한다.
  function balancedPair(n) {
    const pairs = factorPairs(n); // a 오름차순이므로 마지막 쌍이 가장 균형 잡힘
    if (pairs.length === 0) return null;
    if (pairs.length === 1 || Math.random() < 0.7) return pairs[pairs.length - 1];
    return pairs[Math.floor(Math.random() * (pairs.length - 1))];
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

  window.NumMath = { isPrime, factorPairs, randomPair, balancedPair, primesUpTo, compositesUpTo };
})();

// The Airwindows plugins seed their internal random state (used for dither and, in Galactic3, to pick a new
// vibrato speed every cycle) from the C library's rand(). Different C libraries give different streams, so the same
// plugin would sound subtly different on different platforms. This replaces rand()/srand() with one generator that
// is identical everywhere, so a given seed always produces exactly the same audio - in the browser, in Node, natively.
// (No headers on purpose: this file defines the C library symbols themselves.)
typedef unsigned long long u64;
static u64 state = 1;

extern "C" void srand(unsigned seed) {
  u64 z = (u64)seed + 0x9E3779B97F4A7C15ULL; // splitmix64: nearby seeds (1, 2, 3...) give unrelated streams
  z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
  z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
  state = z ^ (z >> 31);
}

extern "C" int rand() {
  state = state * 6364136223846793005ULL + 1442695040888963407ULL;
  return (int)((state >> 33) & 0x7fffffff);
}

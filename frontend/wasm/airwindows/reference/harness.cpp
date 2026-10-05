// Reference harness: the ORIGINAL Airwindows code, VST-free, running the chain from the screenshot.
#include <cstdio>
#include <cstdlib>
#include <vector>
#include <string>
#include <memory>
#include "airwin_consolidated_base.h"
#include "autogen_airwin/Energy2.h"
#include "autogen_airwin/SlewSonic.h"
#include "autogen_airwin/AverMatrix.h"
#include "autogen_airwin/FathomFive.h"
#include "autogen_airwin/Pressure5.h"
#include "autogen_airwin/Galactic3.h"

struct Setting { int index; float raw; };
struct Stage { const char *name; std::unique_ptr<AirwinConsolidatedBase> fx; std::vector<Setting> set; };

// raw = what the plugin stores (0..1). Derived from the screenshot by inverting each plugin's own display function.
struct Spec { const char *name; std::unique_ptr<AirwinConsolidatedBase> (*make)(); std::vector<Setting> set; };
template <class T> static std::unique_ptr<AirwinConsolidatedBase> mk() { return std::make_unique<T>(0); }

// Built exactly like the WebAssembly side: each plugin is created right after srand(seed + its position in the chain),
// or after srand(seed) when running a single plugin on its own.
static std::vector<Stage> build(float sr, unsigned seed = 1, const char *only = nullptr) {
  AirwinConsolidatedBase::defaultSampleRate = sr;
  const Spec specs[] = {
    {"Energy2",    mk<airwinconsolidated::Energy2::Energy2>,       {{0,0.749996f},{1,0.8805665f},{2,0.38854f},{3,0.358285f},{4,0.5f},{5,0.38376f},{6,0.5f},{7,0.5f},{8,1.0f}}},
    {"SlewSonic",  mk<airwinconsolidated::SlewSonic::SlewSonic>,   {{0,0.928337f},{1,0.0207f}}},
    {"AverMatrix", mk<airwinconsolidated::AverMatrix::AverMatrix>, {{0,0.2786579f},{1,0.1130552f},{2,0.6449095f}}},
    {"FathomFive", mk<airwinconsolidated::FathomFive::FathomFive>, {{0,0.785035f},{1,0.0f},{2,0.810504f},{3,0.111477f}}},
    {"Pressure5",  mk<airwinconsolidated::Pressure5::Pressure5>,   {{0,0.291397f},{1,0.0f},{2,0.0f},{3,1.0f},{4,0.5f},{5,1.0f}}},
    {"Galactic3",  mk<airwinconsolidated::Galactic3::Galactic3>,   {{0,0.765918f},{1,0.625794f},{2,0.5f},{3,1.0f},{4,0.164025f},{5,0.058931f}}},
  };
  std::vector<Stage> c; int i = 0;
  for (const auto &sp : specs) {
    if (!only || std::string(only) == sp.name) {
      srand(only ? seed : seed + i);
      Stage st{sp.name, sp.make(), sp.set}; st.fx->setSampleRate(sr);
      for (auto &p : st.set) st.fx->setParameter(p.index, p.raw);
      c.push_back(std::move(st));
    }
    i++;
  }
  return c;
}

int main(int argc, char **argv) {
  if (argc >= 2 && std::string(argv[1]) == "params") {      // print what each plugin DISPLAYS for these raw values
    auto c = build(48000);
    for (auto &s : c) for (auto &p : s.set) { char n[64] = {0}, d[64] = {0}, l[64] = {0}; s.fx->getParameterName(p.index, n); s.fx->getParameterDisplay(p.index, d); s.fx->getParameterLabel(p.index, l); printf("%s|%s|%s|%s\n", s.name, n, d, l); }
    return 0;
  }
  if (argc < 5) { fprintf(stderr, "usage: harness params | harness <samplerate> <in.f32> <out.f32> <seed> [block]\n"); return 1; }
  const char *only = argc > 6 ? argv[6] : nullptr;
  float sr = (float)atof(argv[1]); int block = argc > 5 ? atoi(argv[5]) : 512;
  FILE *fi = fopen(argv[2], "rb"); std::vector<float> in; float v; while (fread(&v, 4, 1, fi) == 1) in.push_back(v); fclose(fi);
  size_t n = in.size(); std::vector<float> L(in), R(in), oL(n), oR(n);   // mono voice -> both channels, as a mixer insert would
  auto chain = build(sr, (unsigned)atoi(argv[4]), only);
  for (size_t pos = 0; pos < n; pos += block) {
    int len = (int)std::min<size_t>(block, n - pos);
    std::vector<float> aL(L.begin() + pos, L.begin() + pos + len), aR(R.begin() + pos, R.begin() + pos + len), bL(len), bR(len);
    for (auto &s : chain) { float *i[2] = {aL.data(), aR.data()}; float *o[2] = {bL.data(), bR.data()}; s.fx->processReplacing(i, o, len); aL = bL; aR = bR; }
    for (int k = 0; k < len; k++) { oL[pos + k] = aL[k]; oR[pos + k] = aR[k]; }
  }
  FILE *fo = fopen(argv[3], "wb"); for (size_t k = 0; k < n; k++) { fwrite(&oL[k], 4, 1, fo); fwrite(&oR[k], 4, 1, fo); } fclose(fo);   // interleaved stereo
  return 0;
}

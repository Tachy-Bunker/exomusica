// A plain C interface over the ORIGINAL Airwindows plugin classes (MIT, Chris Johnson), compiled to WebAssembly.
// The plugin sources are untouched; this file only creates them, sets parameters and runs them on audio.
#include <cstdlib>
#include <cstring>
#include "airwin_consolidated_base.h"
#include "autogen_airwin/Energy2.h"
#include "autogen_airwin/SlewSonic.h"
#include "autogen_airwin/AverMatrix.h"
#include "autogen_airwin/FathomFive.h"
#include "autogen_airwin/Pressure5.h"
#include "autogen_airwin/Galactic3.h"

#define EXPORT(name) __attribute__((export_name(name)))
using Base = AirwinConsolidatedBase;

struct Entry { const char *name; int params; Base *(*make)(); };
static Base *mkEnergy2()    { return new airwinconsolidated::Energy2::Energy2(0); }
static Base *mkSlewSonic()  { return new airwinconsolidated::SlewSonic::SlewSonic(0); }
static Base *mkAverMatrix() { return new airwinconsolidated::AverMatrix::AverMatrix(0); }
static Base *mkFathomFive() { return new airwinconsolidated::FathomFive::FathomFive(0); }
static Base *mkPressure5()  { return new airwinconsolidated::Pressure5::Pressure5(0); }
static Base *mkGalactic3()  { return new airwinconsolidated::Galactic3::Galactic3(0); }
static const Entry kEntries[] = {
  {"Energy2", 9, mkEnergy2}, {"SlewSonic", 2, mkSlewSonic}, {"AverMatrix", 3, mkAverMatrix},
  {"FathomFive", 4, mkFathomFive}, {"Pressure5", 6, mkPressure5}, {"Galactic3", 6, mkGalactic3},
};
static const int kCount = sizeof(kEntries) / sizeof(kEntries[0]);

extern "C" {
EXPORT("aw_count")        int aw_count() { return kCount; }
EXPORT("aw_name")         const char *aw_name(int id) { return (id >= 0 && id < kCount) ? kEntries[id].name : ""; }
EXPORT("aw_param_count")  int aw_param_count(int id) { return (id >= 0 && id < kCount) ? kEntries[id].params : 0; }
// seed: the plugins dither their output with a random generator seeded at creation; a fixed seed makes renders repeatable
EXPORT("aw_create")       void *aw_create(int id, float sampleRate, unsigned seed) {
  if (id < 0 || id >= kCount) return nullptr;
  srand(seed);
  AirwinConsolidatedBase::defaultSampleRate = sampleRate;
  Base *b = kEntries[id].make();
  b->setSampleRate(sampleRate);
  return b;
}
EXPORT("aw_destroy")      void aw_destroy(void *h) { delete (Base *)h; }
EXPORT("aw_set_param")    void aw_set_param(void *h, int i, float v) { ((Base *)h)->setParameter(i, v); }
EXPORT("aw_get_param")    float aw_get_param(void *h, int i) { return ((Base *)h)->getParameter(i); }
EXPORT("aw_param_name")   void aw_param_name(void *h, int i, char *out)    { out[0] = 0; ((Base *)h)->getParameterName(i, out); }
EXPORT("aw_param_display")void aw_param_display(void *h, int i, char *out) { out[0] = 0; ((Base *)h)->getParameterDisplay(i, out); }
EXPORT("aw_param_label")  void aw_param_label(void *h, int i, char *out)   { out[0] = 0; ((Base *)h)->getParameterLabel(i, out); }
EXPORT("aw_process")      void aw_process(void *h, float *inL, float *inR, float *outL, float *outR, int n) {
  float *in[2] = {inL, inR}; float *out[2] = {outL, outR};
  ((Base *)h)->processReplacing(in, out, n);
}
EXPORT("aw_alloc")        void *aw_alloc(int bytes) { return malloc(bytes); }
EXPORT("aw_free")         void aw_free(void *p) { free(p); }
}

# Airwindows in the browser

The voice chain's plugins (Energy2, SlewSonic, AverMatrix, FathomFive, Pressure5, Galactic3) are the **original Airwindows
C++ code** (MIT, Chris Johnson), taken unmodified from the `airwin2rack` project's VST-free copy (MIT, Paul Walker), and
compiled to WebAssembly with wasi-sdk. Nothing is ported or re-implemented: `aw_wasm.cpp` only creates the plugin classes,
sets parameters and runs audio through them.

- `src/` - the verbatim plugin sources + the VST-free base class
- `aw_wasm.cpp` - the C interface the browser calls
- `build.sh` - rebuilds `public/dsp/airwindows_voice.wasm` (the built file is committed, so the site build needs no compiler)
- `reference/` - a native g++ build of the same code; the tests compare the WebAssembly output against it sample for sample

To add another Airwindows plugin: copy its `autogen_airwin/<Name>*.{h,cpp}` from airwin2rack, add it to `aw_wasm.cpp` and `build.sh`.

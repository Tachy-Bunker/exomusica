#!/bin/sh
# Rebuilds public/dsp/airwindows_voice.wasm from the ORIGINAL Airwindows sources in ./src (unmodified).
# Needs wasi-sdk (https://github.com/WebAssembly/wasi-sdk/releases, tested with 25.0):
#   WASI_SDK=/path/to/wasi-sdk-25.0-x86_64-linux ./build.sh
set -e
cd "$(dirname "$0")"
SDK="${WASI_SDK:?set WASI_SDK to the wasi-sdk folder}"
PLUGINS="Energy2 SlewSonic AverMatrix FathomFive Pressure5 Galactic3"
FILES=""; for n in $PLUGINS; do FILES="$FILES src/autogen_airwin/$n.cpp src/autogen_airwin/${n}Proc.cpp"; done
"$SDK/bin/clang++" --target=wasm32-wasi --sysroot="$SDK/share/wasi-sysroot" -O3 -std=c++17 -fno-exceptions -fno-rtti -w \
  -mexec-model=reactor -Wl,--no-entry -I src -o ../../public/dsp/airwindows_voice.wasm aw_wasm.cpp aw_rand.cpp src/airwin_consolidated_base.cpp $FILES
ls -l ../../public/dsp/airwindows_voice.wasm

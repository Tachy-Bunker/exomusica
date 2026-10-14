#!/bin/sh
# Builds public/dsp/airwindows_lab.wasm: every plugin listed in gen_lab.py (run that first). The small voice build (build.sh) is untouched.
#   WASI_SDK=/path/to/wasi-sdk-25.0-x86_64-linux ./build_lab.sh
set -e
cd "$(dirname "$0")"
SDK="${WASI_SDK:?set WASI_SDK to the wasi-sdk folder}"
python3 gen_lab.py
"$SDK/bin/clang++" --target=wasm32-wasi --sysroot="$SDK/share/wasi-sysroot" -O2 -std=c++17 -fno-exceptions -fno-rtti -w -DLAB \
  -mexec-model=reactor -Wl,--no-entry -Wl,--gc-sections -I src -o ../../public/dsp/airwindows_lab.wasm aw_wasm.cpp aw_rand.cpp src/airwin_consolidated_base.cpp $(cat lab_files.txt)
ls -l ../../public/dsp/airwindows_lab.wasm

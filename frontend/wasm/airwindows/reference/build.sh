#!/bin/sh
# Builds the NATIVE reference: the same original plugin code compiled with g++, used to prove the WebAssembly build matches it.
set -e
cd "$(dirname "$0")/.."
PLUGINS="Energy2 SlewSonic AverMatrix FathomFive Pressure5 Galactic3"
FILES=""; for n in $PLUGINS; do FILES="$FILES src/autogen_airwin/$n.cpp src/autogen_airwin/${n}Proc.cpp"; done
sed 's|#include "\([A-Za-z0-9]*\)\.h"|#include "autogen_airwin/\1.h"|' reference/harness.cpp > reference/.harness_build.cpp
g++ -O2 -std=c++17 -w -I src -o reference/harness reference/.harness_build.cpp aw_rand.cpp src/airwin_consolidated_base.cpp $FILES
echo built reference/harness

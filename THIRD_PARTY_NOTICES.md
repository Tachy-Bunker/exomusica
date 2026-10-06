# Third-party software in Exomusica

Code that runs in visitors' browsers, and the licenses it comes with.

| Component | What it's used for | License |
|-|-|-|
| Airwindows plugins (Chris Johnson) | The voice "Enhancer" effect. Original source, unmodified (`frontend/wasm/airwindows/src`), compiled to WebAssembly | MIT |
| airwin2rack (Paul Walker) | VST-free copy of the Airwindows sources | MIT |
| wasm-media-encoders | mp3 and ogg download formats | MIT wrapper |
| &nbsp;&nbsp;LAME (inside the above) | mp3 encoding | LGPL-2.1+ |
| &nbsp;&nbsp;libvorbis / libogg (inside the above) | ogg encoding | BSD-3-Clause |
| mediabunny | Writes the `.m4a` container | MPL-2.0 |
| @mediabunny/aac-encoder (FFmpeg's AAC encoder, WebAssembly) | aac download format, used only when the browser has no AAC encoder of its own | MPL-2.0 wrapper; FFmpeg libavcodec is LGPL-2.1+ |
| qrcode-generator | QR codes | MIT |

The full license texts ship inside each package in `node_modules`, and the Airwindows ones are in
`frontend/wasm/airwindows/LICENSE-*.txt`. Source for the LGPL parts is available from the upstream projects named above.

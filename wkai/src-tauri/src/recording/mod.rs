// Native recording/streaming pipeline (Phase 1a: FFmpeg-direct capture+encode).
//
// See native-capture-obs-level-plan.md for the full hybrid architecture. This
// module currently drives an FFmpeg child process for on-disk recording; the
// Rust WGC/DXGI capture layer and the WHIP stream chain land in later phases on
// top of the same config + arg-builder.

pub mod config;
pub mod ffmpeg;

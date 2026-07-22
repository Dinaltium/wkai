// Recording / streaming configuration types.
//
// These mirror the "Capture / Recording / Streaming" config groups in the OBS-like
// settings UI. Serialised camelCase to match the TS side.

use serde::{Deserialize, Serialize};

/// How the desktop is captured. Phase 1a uses FFmpeg-direct capture (validated in
/// the Phase 0 spike). Phase 1b will add a Rust WGC/DXGI capture that pipes raw
/// frames to FFmpeg for OBS-grade source control.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum CaptureMode {
    /// GPU: Desktop Duplication via ffmpeg `ddagrab` (spike: works via download path).
    GpuDda,
    /// CPU: GDI via ffmpeg `gdigrab` (spike: works, real-time).
    CpuGdi,
}

/// Video encoder. Spike confirmed nvenc + x264 both real-time on the target box.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum VideoEncoder {
    NvencH264,
    NvencHevc,
    QsvH264,
    AmfH264,
    X264,
}

impl VideoEncoder {
    pub fn ffmpeg_name(&self) -> &'static str {
        match self {
            VideoEncoder::NvencH264 => "h264_nvenc",
            VideoEncoder::NvencHevc => "hevc_nvenc",
            VideoEncoder::QsvH264 => "h264_qsv",
            VideoEncoder::AmfH264 => "h264_amf",
            VideoEncoder::X264 => "libx264",
        }
    }

    pub fn is_hardware(&self) -> bool {
        !matches!(self, VideoEncoder::X264)
    }

    /// The rate-control CLI flag for a constant-quality value differs by encoder:
    /// x264 uses `-crf`, the hardware encoders use `-cq` / `-global_quality`.
    pub fn quality_flag(&self) -> &'static str {
        match self {
            VideoEncoder::X264 => "-crf",
            VideoEncoder::QsvH264 => "-global_quality",
            _ => "-cq", // nvenc / amf
        }
    }
}

/// Constant bitrate vs constant quality.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "kebab-case")]
pub enum RateControl {
    /// Target average bitrate in kbps.
    Cbr {
        #[serde(rename = "bitrateKbps")]
        bitrate_kbps: u32,
    },
    /// Constant quality (0 = lossless-ish, higher = smaller/worse). ~18-28 typical.
    Crf { quality: u8 },
}

/// Recording (to disk) settings. Independent from streaming settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordConfig {
    pub capture_mode: CaptureMode,
    pub fps: u32,
    /// Output resolution. None = keep native capture resolution.
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub encoder: VideoEncoder,
    pub rate_control: RateControl,
    /// Keyframe interval in seconds (GOP = fps * this).
    pub keyframe_interval_secs: u32,
    /// "mp4" or "mkv".
    pub container: String,
    /// DirectShow audio device name (as listed by probe.ps1), or None for silent.
    pub audio_device: Option<String>,
    pub audio_bitrate_kbps: u32,
    /// Absolute path to write the recording to.
    pub output_path: String,
}

impl Default for RecordConfig {
    fn default() -> Self {
        // "Compatibility" default — works everywhere per the spike.
        RecordConfig {
            capture_mode: CaptureMode::CpuGdi,
            fps: 30,
            width: None,
            height: None,
            encoder: VideoEncoder::X264,
            rate_control: RateControl::Cbr { bitrate_kbps: 6000 },
            keyframe_interval_secs: 2,
            container: "mp4".into(),
            audio_device: None,
            audio_bitrate_kbps: 160,
            output_path: String::new(),
        }
    }
}

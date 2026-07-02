// FFmpeg argument builder — the concrete encoding of the Phase 0 spike findings.
//
// Phase 1a: FFmpeg does capture + encode + mux (native, no browser). The combos
// here are the ones the spike proved real-time:
//   - CPU: gdigrab + libx264
//   - GPU: ddagrab (download) + h264_nvenc
// Phase 1b will replace the capture INPUT with raw frames piped from Rust WGC/DXGI,
// keeping the encode/mux tail below unchanged.

use super::config::{CaptureMode, RateControl, RecordConfig};

/// Build the full FFmpeg argv (excluding the binary name) for a recording.
pub fn build_record_args(cfg: &RecordConfig) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    a.push("-hide_banner".into());
    a.push("-y".into());

    let fps = cfg.fps.max(1);

    // ── Video input (capture) ────────────────────────────────────────────────
    // A scale filter, if the user picked an output size.
    let scale_filter = match (cfg.width, cfg.height) {
        (Some(w), Some(h)) => Some(format!("scale={w}:{h}")),
        _ => None,
    };

    match cfg.capture_mode {
        CaptureMode::CpuGdi => {
            a.extend(["-f", "gdigrab", "-framerate", &fps.to_string(), "-i", "desktop"].map(String::from));
            if let Some(sf) = &scale_filter {
                a.extend(["-vf", sf].map(|s| s.to_string()));
            }
        }
        CaptureMode::GpuDda => {
            // Desktop Duplication -> download to system memory -> nv12 (the spike's
            // working GPU path). Append scale into the same filter chain if set.
            let mut chain = format!("ddagrab=framerate={fps},hwdownload,format=bgra");
            if let Some(sf) = &scale_filter {
                chain.push(',');
                chain.push_str(sf);
            }
            chain.push_str(",format=nv12");
            a.extend(["-filter_complex", &chain].map(|s| s.to_string()));
        }
    }

    // ── Audio input (optional) ───────────────────────────────────────────────
    let has_audio = cfg.audio_device.is_some();
    if let Some(dev) = &cfg.audio_device {
        a.extend(["-f", "dshow", "-i", &format!("audio={dev}")].map(|s| s.to_string()));
    }

    // ── Video encode ─────────────────────────────────────────────────────────
    a.extend(["-c:v", cfg.encoder.ffmpeg_name()].map(|s| s.to_string()));
    match &cfg.rate_control {
        RateControl::Cbr { bitrate_kbps } => {
            a.extend(["-b:v", &format!("{bitrate_kbps}k")].map(|s| s.to_string()));
        }
        RateControl::Crf { quality } => {
            a.extend([cfg.encoder.quality_flag(), &quality.to_string()].map(|s| s.to_string()));
        }
    }
    // Keyframe interval (GOP).
    let gop = (fps * cfg.keyframe_interval_secs.max(1)).to_string();
    a.extend(["-g", &gop].map(|s| s.to_string()));
    // Broad-compatibility pixel format for software / gdi paths.
    if !cfg.encoder.is_hardware() || cfg.capture_mode == CaptureMode::CpuGdi {
        a.extend(["-pix_fmt", "yuv420p"].map(|s| s.to_string()));
    }

    // ── Audio encode ─────────────────────────────────────────────────────────
    if has_audio {
        a.extend(
            ["-c:a", "aac", "-b:a", &format!("{}k", cfg.audio_bitrate_kbps)].map(|s| s.to_string()),
        );
    }

    // ── Output ───────────────────────────────────────────────────────────────
    // Faststart so the mp4 is streamable/seekable after a clean finalize.
    if cfg.container == "mp4" {
        a.extend(["-movflags", "+faststart"].map(|s| s.to_string()));
    }
    a.push(cfg.output_path.clone());
    a
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::recording::config::*;

    #[test]
    fn cpu_gdi_x264_cbr_builds() {
        let cfg = RecordConfig {
            output_path: "C:/tmp/out.mp4".into(),
            ..Default::default()
        };
        let args = build_record_args(&cfg);
        let joined = args.join(" ");
        assert!(joined.contains("gdigrab"));
        assert!(joined.contains("libx264"));
        assert!(joined.contains("-b:v 6000k"));
        assert!(joined.contains("+faststart"));
        assert!(joined.ends_with("C:/tmp/out.mp4"));
    }

    #[test]
    fn gpu_dda_nvenc_crf_builds() {
        let cfg = RecordConfig {
            capture_mode: CaptureMode::GpuDda,
            encoder: VideoEncoder::NvencH264,
            rate_control: RateControl::Crf { quality: 23 },
            output_path: "C:/tmp/g.mp4".into(),
            ..Default::default()
        };
        let args = build_record_args(&cfg);
        let joined = args.join(" ");
        assert!(joined.contains("ddagrab=framerate=30,hwdownload,format=bgra,format=nv12"));
        assert!(joined.contains("h264_nvenc"));
        assert!(joined.contains("-cq 23"));
    }
}

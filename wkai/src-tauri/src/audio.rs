use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

static RECORDING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct AudioChunkPayload {
    pub session_id: String,
    pub audio_b64: String,
    pub timestamp: String,
    pub duration_secs: u32,
}

/// Start recording microphone audio in 30-second chunks.
/// Each chunk is base64-encoded WAV and emitted as a Tauri event
/// so the frontend can forward it to the Whisper endpoint.
pub fn start_audio_capture(app: AppHandle, session_id: String) -> Result<(), String> {
    if RECORDING.load(Ordering::SeqCst) {
        return Err("Audio capture already running".to_string());
    }

    RECORDING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        let host = cpal::default_host();

        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                log::error!("[Audio] No input device found");
                return;
            }
        };

        log::info!("[Audio] Using device: {}", device.name().unwrap_or_default());

        let config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                log::error!("[Audio] Could not get input config: {}", e);
                return;
            }
        };

        let sample_rate = config.sample_rate().0;
        let channels   = config.channels() as usize;
        let chunk_secs = 30u32;
        let chunk_size = (sample_rate * channels as u32 * chunk_secs) as usize;

        let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(chunk_size)));
        let samples_clone = samples.clone();

        let stream = device
            .build_input_stream(
                &config.into(),
                move |data: &[f32], _| {
                    let mut buf = samples_clone.lock().unwrap();
                    buf.extend_from_slice(data);
                },
                |err| log::error!("[Audio] Stream error: {}", err),
                None,
            )
            .map_err(|e| e.to_string());

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                log::error!("[Audio] Failed to build stream: {}", e);
                return;
            }
        };

        let _ = stream.play();

        loop {
            if !RECORDING.load(Ordering::SeqCst) {
                break;
            }

            std::thread::sleep(std::time::Duration::from_secs(chunk_secs as u64));

            let chunk: Vec<f32> = {
                let mut buf = samples.lock().unwrap();
                let chunk = buf.clone();
                buf.clear();
                chunk
            };

            if chunk.is_empty() {
                continue;
            }

            // Convert f32 samples to WAV bytes
            let wav_bytes = samples_to_wav(&chunk, sample_rate, channels as u16);
            let audio_b64 = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

            let _ = app.emit(
                "audio-chunk",
                AudioChunkPayload {
                    session_id: session_id.clone(),
                    audio_b64,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    duration_secs: chunk_secs,
                },
            );

            log::info!("[Audio] Emitted chunk ({} samples)", chunk.len());
        }

        log::info!("[Audio] Recording stopped");
    });

    Ok(())
}

pub fn stop_audio_capture() {
    RECORDING.store(false, Ordering::SeqCst);
}

/// Convert raw f32 PCM samples to a minimal WAV file in memory.
fn samples_to_wav(samples: &[f32], sample_rate: u32, channels: u16) -> Vec<u8> {
    // Convert f32 [-1.0, 1.0] to i16
    let pcm: Vec<i16> = samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect();

    let data_len  = (pcm.len() * 2) as u32;
    let file_len  = data_len + 36;
    let byte_rate = sample_rate * channels as u32 * 2;

    let mut wav = Vec::with_capacity(file_len as usize + 8);

    // RIFF header
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&file_len.to_le_bytes());
    wav.extend_from_slice(b"WAVE");

    // fmt chunk
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());          // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes());            // PCM format
    wav.extend_from_slice(&channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&(channels * 2).to_le_bytes()); // block align
    wav.extend_from_slice(&16u16.to_le_bytes());           // bits per sample

    // data chunk
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in &pcm {
        wav.extend_from_slice(&sample.to_le_bytes());
    }

    wav
}

use base64::{engine::general_purpose, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

static RECORDING: AtomicBool = AtomicBool::new(false);

// Bumped on every start. A capture thread only keeps running while it owns the
// current generation, so a stop/start inside one chunk window (flipping the
// transcription toggle) can never leave the previous thread alive to emit a
// duplicate chunk from a stale buffer.
static GENERATION: AtomicU64 = AtomicU64::new(0);

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
///
/// This was written but never exposed: without `#[tauri::command]` and an entry
/// in `generate_handler!`, the frontend had no way to reach it, so no
/// `audio-chunk` event was ever emitted and the whole Whisper → transcript →
/// guide-block path sat idle behind a listener that never fired.
/// Input devices the instructor can transcribe from, by name.
#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host.input_devices().map_err(|e| e.to_string())?;
    Ok(devices.filter_map(|d| d.name().ok()).collect())
}

/// `device_name` picks an input by name; `None` falls back to the system
/// default. The default is often not the microphone the instructor is speaking
/// into — a machine with a virtual mic (Steam, WO Mic, a headset dock) will
/// happily hand back a silent or unrelated endpoint, which is transcribed as
/// confident nonsense rather than failing loudly.
///
/// Returns the name of the device actually opened so the caller can show it.
#[tauri::command]
pub fn start_audio_capture(
    app: AppHandle,
    session_id: String,
    device_name: Option<String>,
) -> Result<String, String> {
    if RECORDING.load(Ordering::SeqCst) {
        return Err("Audio capture already running".to_string());
    }

    let host = cpal::default_host();
    let requested = device_name.filter(|n| !n.trim().is_empty());
    let device = match &requested {
        Some(name) => host
            .input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().map(|n| &n == name).unwrap_or(false))
            .ok_or_else(|| format!("Input device not found: {}", name))?,
        None => host
            .default_input_device()
            .ok_or_else(|| "No input device found".to_string())?,
    };

    let device_label = device.name().unwrap_or_else(|_| "unknown".to_string());
    let config = device
        .default_input_config()
        .map_err(|e| format!("Could not get input config: {}", e))?;

    RECORDING.store(true, Ordering::SeqCst);
    let my_generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let opened_label = device_label.clone();

    std::thread::spawn(move || {
        log::info!("[Audio] Using device: {}", device_label);

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
            if !RECORDING.load(Ordering::SeqCst) || GENERATION.load(Ordering::SeqCst) != my_generation {
                break;
            }

            // Slept in one-second steps rather than one 30s block so a stop is
            // honoured almost immediately instead of up to a full chunk later.
            let mut waited = 0u32;
            while waited < chunk_secs {
                if !RECORDING.load(Ordering::SeqCst) || GENERATION.load(Ordering::SeqCst) != my_generation {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
                waited += 1;
            }
            if !RECORDING.load(Ordering::SeqCst) || GENERATION.load(Ordering::SeqCst) != my_generation {
                break;
            }

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

    Ok(opened_label)
}

#[tauri::command]
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

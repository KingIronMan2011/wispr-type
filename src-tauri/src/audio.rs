use crate::{
    models::{AppState, Transcript},
    storage::load_settings,
    transcription::transcribe_audio,
};
use chrono::Utc;
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    FromSample, Sample, SampleFormat, SupportedStreamConfig,
};
use serde::Serialize;
use std::{
    fs,
    fs::File,
    io::BufWriter,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, State};

type WavWriter = hound::WavWriter<BufWriter<File>>;
type WavWriterHandle = Arc<Mutex<Option<WavWriter>>>;

pub(crate) struct NativeRecording {
    stream: cpal::Stream,
    writer: WavWriterHandle,
    path: PathBuf,
}

// Windows/WASAPI is the sole current target. CPAL's platform wrapper is
// conservatively non-Send despite Windows streams being safe in app state.
unsafe impl Send for NativeRecording {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AudioDevice {
    value: String,
    label: String,
}

fn wav_spec_from_config(config: &SupportedStreamConfig) -> hound::WavSpec {
    hound::WavSpec {
        channels: config.channels(),
        sample_rate: config.sample_rate().0,
        bits_per_sample: (config.sample_format().sample_size() * 8) as u16,
        sample_format: if config.sample_format().is_float() {
            hound::SampleFormat::Float
        } else {
            hound::SampleFormat::Int
        },
    }
}

fn write_input_data<T, U>(input: &[T], writer: &WavWriterHandle)
where
    T: Sample,
    U: Sample + hound::Sample + FromSample<T>,
{
    if let Ok(mut guard) = writer.try_lock() {
        if let Some(writer) = guard.as_mut() {
            for &sample in input {
                let _ = writer.write_sample(U::from_sample(sample));
            }
        }
    }
}

fn input_stream(
    device: &cpal::Device,
    config: &SupportedStreamConfig,
    writer: WavWriterHandle,
) -> Result<cpal::Stream, String> {
    let stream_config = config.clone().into();
    match config.sample_format() {
        SampleFormat::I8 => device
            .build_input_stream(
                &stream_config,
                move |data, _| write_input_data::<i8, i8>(data, &writer),
                |_| {},
                None,
            )
            .map_err(|err| err.to_string()),
        SampleFormat::I16 => device
            .build_input_stream(
                &stream_config,
                move |data, _| write_input_data::<i16, i16>(data, &writer),
                |_| {},
                None,
            )
            .map_err(|err| err.to_string()),
        SampleFormat::I32 => device
            .build_input_stream(
                &stream_config,
                move |data, _| write_input_data::<i32, i32>(data, &writer),
                |_| {},
                None,
            )
            .map_err(|err| err.to_string()),
        SampleFormat::F32 => device
            .build_input_stream(
                &stream_config,
                move |data, _| write_input_data::<f32, f32>(data, &writer),
                |_| {},
                None,
            )
            .map_err(|err| err.to_string()),
        format => Err(format!("Unsupported microphone sample format: {format}")),
    }
}

pub(crate) fn get_microphones() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let mut devices = vec![AudioDevice {
        value: "Default microphone".into(),
        label: "Default microphone".into(),
    }];
    for device in host.input_devices().map_err(|err| err.to_string())? {
        if let Ok(name) = device.name() {
            devices.push(AudioDevice {
                value: name.clone(),
                label: name,
            });
        }
    }
    Ok(devices)
}

pub(crate) fn start_native_recording(state: State<AppState>) -> Result<(), String> {
    let mut active = state
        .recording
        .lock()
        .map_err(|_| "Recording is unavailable".to_string())?;
    if active.is_some() {
        return Ok(());
    }
    let settings = load_settings(&state);
    let host = cpal::default_host();
    let device = if settings.microphone == "Default microphone" {
        host.default_input_device()
    } else {
        host.input_devices()
            .ok()
            .and_then(|mut devices| {
                devices.find(|device| {
                    device.name().ok().as_deref() == Some(settings.microphone.as_str())
                })
            })
            .or_else(|| host.default_input_device())
    }
    .ok_or_else(|| "No microphone is available on this computer.".to_string())?;
    let config = device
        .default_input_config()
        .map_err(|err| format!("Couldn’t open the microphone: {err}"))?;
    let path = state
        .data_dir
        .join(format!("capture-{}.wav", Utc::now().timestamp_millis()));
    let writer = hound::WavWriter::create(&path, wav_spec_from_config(&config))
        .map_err(|err| err.to_string())?;
    let writer = Arc::new(Mutex::new(Some(writer)));
    let stream = input_stream(&device, &config, writer.clone())?;
    stream.play().map_err(|err| err.to_string())?;
    *active = Some(NativeRecording {
        stream,
        writer,
        path,
    });
    Ok(())
}

pub(crate) async fn stop_native_recording(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Transcript, String> {
    let recording = state
        .recording
        .lock()
        .map_err(|_| "Recording is unavailable".to_string())?
        .take()
        .ok_or_else(|| "There isn’t an active recording.".to_string())?;
    drop(recording.stream);
    recording
        .writer
        .lock()
        .map_err(|_| "Couldn’t finalize the recording.".to_string())?
        .take()
        .ok_or_else(|| "Couldn’t finalize the recording.".to_string())?
        .finalize()
        .map_err(|err| err.to_string())?;
    let audio = fs::read(&recording.path).map_err(|err| err.to_string())?;
    let _ = fs::remove_file(&recording.path);
    transcribe_audio(app, &state, audio, "audio/wav").await
}

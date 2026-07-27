use hound::{SampleFormat, WavReader};
use opus_rs::{Application, OpusEncoder};
use std::path::Path;

const OPUS_SAMPLE_RATE: u32 = 48_000;
const OPUS_FRAME_SAMPLES: usize = 960;
const OPUS_BITRATE: i32 = 32_000;
const WEBM_TIMECODE_SCALE: u64 = 1_000_000;
const CLUSTER_DURATION_MS: u64 = 30_000;

fn read_pcm(path: &Path) -> Result<(Vec<f32>, u32, usize), String> {
    let reader = WavReader::open(path).map_err(|error| error.to_string())?;
    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let channels = usize::from(spec.channels.max(1));
    let samples = match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Float, _) => reader
            .into_samples::<f32>()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
        (SampleFormat::Int, 8) => reader
            .into_samples::<i8>()
            .map(|sample| sample.map(|value| value as f32 / i8::MAX as f32))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
        (SampleFormat::Int, 16) => reader
            .into_samples::<i16>()
            .map(|sample| sample.map(|value| value as f32 / i16::MAX as f32))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
        (SampleFormat::Int, _) => reader
            .into_samples::<i32>()
            .map(|sample| sample.map(|value| value as f32 / i32::MAX as f32))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?,
    };
    Ok((samples, sample_rate, channels))
}

pub(crate) fn read_wav_as_whisper_pcm(path: &Path) -> Result<Vec<f32>, String> {
    const WHISPER_SAMPLE_RATE: u32 = 16_000;
    let (samples, sample_rate, channels) = read_pcm(path)?;
    let mono = samples
        .chunks(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / frame.len().max(1) as f32)
        .collect::<Vec<_>>();
    if mono.is_empty() {
        return Ok(Vec::new());
    }
    let output_frames = (mono.len() as u64 * u64::from(WHISPER_SAMPLE_RATE)
        + u64::from(sample_rate) / 2)
        / u64::from(sample_rate);
    let mut output = Vec::with_capacity(output_frames as usize);
    for output_index in 0..output_frames as usize {
        let source_position =
            output_index as f64 * f64::from(sample_rate) / f64::from(WHISPER_SAMPLE_RATE);
        let left = source_position.floor() as usize;
        let right = (left + 1).min(mono.len() - 1);
        let fraction = (source_position - left as f64) as f32;
        output.push((mono[left] + (mono[right] - mono[left]) * fraction).clamp(-1.0, 1.0));
    }
    Ok(output)
}

fn resample_to_opus_mono(samples: &[f32], sample_rate: u32, channels: usize) -> Vec<f32> {
    let mono = samples
        .chunks(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / frame.len().max(1) as f32)
        .collect::<Vec<_>>();
    if mono.is_empty() {
        return Vec::new();
    }

    let output_frames = (mono.len() as u64 * u64::from(OPUS_SAMPLE_RATE)
        + u64::from(sample_rate) / 2)
        / u64::from(sample_rate);
    let mut output = Vec::with_capacity(output_frames as usize);
    for output_index in 0..output_frames as usize {
        let source_position =
            output_index as f64 * f64::from(sample_rate) / f64::from(OPUS_SAMPLE_RATE);
        let left = source_position.floor() as usize;
        let right = (left + 1).min(mono.len() - 1);
        let fraction = (source_position - left as f64) as f32;
        let sample = mono[left] + (mono[right] - mono[left]) * fraction;
        output.push(sample.clamp(-1.0, 1.0));
    }
    output
}

fn write_vint(output: &mut Vec<u8>, value: usize) {
    for length in 1..=8 {
        let max = (1usize << (7 * length)) - 1;
        if value < max {
            let mut bytes = value.to_be_bytes()[std::mem::size_of::<usize>() - length..].to_vec();
            bytes[0] |= 1 << (8 - length);
            output.extend(bytes);
            return;
        }
    }
    unreachable!("WebM element is too large");
}

fn element(output: &mut Vec<u8>, id: &[u8], payload: &[u8]) {
    output.extend_from_slice(id);
    write_vint(output, payload.len());
    output.extend_from_slice(payload);
}

fn uint(value: u64) -> Vec<u8> {
    let bytes = value.to_be_bytes();
    let first = bytes.iter().position(|byte| *byte != 0).unwrap_or(7);
    bytes[first..].to_vec()
}

fn opus_head() -> Vec<u8> {
    let mut header = b"OpusHead".to_vec();
    header.push(1);
    header.push(1);
    header.extend_from_slice(&0u16.to_le_bytes());
    header.extend_from_slice(&OPUS_SAMPLE_RATE.to_le_bytes());
    header.extend_from_slice(&0i16.to_le_bytes());
    header.push(0);
    header
}

fn webm_header() -> Vec<u8> {
    let mut header = Vec::new();
    element(&mut header, &[0x42, 0x86], &[1]);
    element(&mut header, &[0x42, 0xf7], &[1]);
    element(&mut header, &[0x42, 0xf2], &[4]);
    element(&mut header, &[0x42, 0xf3], &[8]);
    element(&mut header, &[0x42, 0x82], b"webm");
    element(&mut header, &[0x42, 0x87], &[4]);
    element(&mut header, &[0x42, 0x85], &[2]);
    let mut output = Vec::new();
    element(&mut output, &[0x1a, 0x45, 0xdf, 0xa3], &header);
    output
}

fn webm_info() -> Vec<u8> {
    let mut info = Vec::new();
    element(&mut info, &[0x2a, 0xd7, 0xb1], &uint(WEBM_TIMECODE_SCALE));
    element(&mut info, &[0x4d, 0x80], b"Veskri");
    element(&mut info, &[0x57, 0x41], b"Veskri");
    let mut output = Vec::new();
    element(&mut output, &[0x15, 0x49, 0xa9, 0x66], &info);
    output
}

fn webm_tracks() -> Vec<u8> {
    let mut audio = Vec::new();
    element(
        &mut audio,
        &[0xb5],
        &(OPUS_SAMPLE_RATE as f64).to_be_bytes(),
    );
    element(&mut audio, &[0x9f], &[1]);

    let mut track = Vec::new();
    element(&mut track, &[0xd7], &[1]);
    element(&mut track, &[0x73, 0xc5], &[1]);
    element(&mut track, &[0x83], &[2]);
    element(&mut track, &[0x86], b"A_OPUS");
    element(&mut track, &[0x63, 0xa2], &opus_head());
    element(&mut track, &[0xe1], &audio);

    let mut tracks = Vec::new();
    element(&mut tracks, &[0xae], &track);
    let mut output = Vec::new();
    element(&mut output, &[0x16, 0x54, 0xae, 0x6b], &tracks);
    output
}

fn append_cluster(output: &mut Vec<u8>, timestamp_ms: u64, frames: &[Vec<u8>]) {
    let mut cluster = Vec::new();
    element(&mut cluster, &[0xe7], &uint(timestamp_ms));
    for (index, frame) in frames.iter().enumerate() {
        let relative_time = i16::try_from(index as u64 * 20).unwrap_or(i16::MAX);
        let mut block = vec![0x81];
        block.extend_from_slice(&relative_time.to_be_bytes());
        block.push(0x80);
        block.extend_from_slice(frame);
        element(&mut cluster, &[0xa3], &block);
    }
    element(output, &[0x1f, 0x43, 0xb6, 0x75], &cluster);
}

pub(crate) fn encode_wav_as_webm_opus(path: &Path) -> Result<Vec<u8>, String> {
    let (samples, sample_rate, channels) = read_pcm(path)?;
    let mut pcm = resample_to_opus_mono(&samples, sample_rate, channels);
    if pcm.is_empty() {
        return Err("No audio was captured.".into());
    }
    let remainder = pcm.len() % OPUS_FRAME_SAMPLES;
    if remainder != 0 {
        pcm.resize(pcm.len() + OPUS_FRAME_SAMPLES - remainder, 0.0);
    }

    let mut encoder =
        OpusEncoder::new(OPUS_SAMPLE_RATE as i32, 1, Application::Voip).map_err(str::to_string)?;
    encoder.bitrate_bps = OPUS_BITRATE;
    encoder.complexity = 5;
    let frames = pcm
        .chunks_exact(OPUS_FRAME_SAMPLES)
        .map(|frame| {
            let mut encoded = vec![0; 1_275];
            let length = encoder
                .encode(frame, OPUS_FRAME_SAMPLES, &mut encoded)
                .map_err(str::to_string)?;
            encoded.truncate(length);
            Ok::<Vec<u8>, String>(encoded)
        })
        .collect::<Result<Vec<_>, _>>()?;

    let mut output = webm_header();
    output.extend_from_slice(&[0x18, 0x53, 0x80, 0x67]);
    output.extend_from_slice(&[0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    output.extend(webm_info());
    output.extend(webm_tracks());
    for (cluster_index, cluster) in frames
        .chunks((CLUSTER_DURATION_MS / 20) as usize)
        .enumerate()
    {
        append_cluster(
            &mut output,
            cluster_index as u64 * CLUSTER_DURATION_MS,
            cluster,
        );
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::{
        encode_wav_as_webm_opus, resample_to_opus_mono, write_vint, OPUS_FRAME_SAMPLES,
        OPUS_SAMPLE_RATE,
    };
    use opus_rs::OpusDecoder;
    use std::{env, fs};

    #[test]
    fn webm_sizes_use_valid_variable_length_integers() {
        let mut output = Vec::new();
        write_vint(&mut output, 127);
        assert_eq!(output, vec![0x40, 0x7f]);
    }

    #[test]
    fn resampler_creates_mono_opus_rate_audio() {
        let stereo = (0..480)
            .flat_map(|_| [0.25_f32, -0.25_f32])
            .collect::<Vec<_>>();
        let pcm = resample_to_opus_mono(&stereo, OPUS_SAMPLE_RATE, 2);
        assert_eq!(pcm.len(), 480);
        assert!(pcm.iter().all(|sample| *sample == 0.0));
    }

    #[test]
    fn webm_output_contains_an_opus_packet_that_decodes() {
        let path = env::temp_dir().join(format!("veskri-opus-test-{}.wav", std::process::id()));
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: OPUS_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for index in 0..OPUS_FRAME_SAMPLES * 2 {
            let phase = index as f32 / OPUS_SAMPLE_RATE as f32 * 440.0 * std::f32::consts::TAU;
            writer.write_sample((phase.sin() * 8_000.0) as i16).unwrap();
        }
        writer.finalize().unwrap();

        let webm = encode_wav_as_webm_opus(&path).unwrap();
        fs::remove_file(path).unwrap();
        assert_eq!(&webm[..4], &[0x1a, 0x45, 0xdf, 0xa3]);
        assert!(webm.windows(6).any(|bytes| bytes == b"A_OPUS"));

        let block_start = webm
            .windows(6)
            .position(|bytes| bytes[0] == 0xa3 && bytes[2..] == [0x81, 0, 0, 0x80])
            .expect("a SimpleBlock with an Opus packet");
        let block_length = usize::from(webm[block_start + 1] & 0x7f);
        let payload_start = block_start + 2;
        let packet = &webm[payload_start + 4..payload_start + block_length];
        let mut decoder = OpusDecoder::new(OPUS_SAMPLE_RATE as i32, 1).unwrap();
        let mut decoded = vec![0.0; OPUS_FRAME_SAMPLES];
        assert_eq!(
            decoder
                .decode(packet, OPUS_FRAME_SAMPLES, &mut decoded)
                .unwrap(),
            OPUS_FRAME_SAMPLES
        );
    }
}

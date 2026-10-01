//! Thin WASM wrapper around the `evtx` crate. JS feeds one 64 KiB chunk at a time (read from the user's File),
//! so memory stays bounded for multi-GB logs. Nothing here touches the network, filesystem or clock.
use evtx::{EvtxChunkData, ParserSettings};
use std::sync::Arc;
use wasm_bindgen::prelude::*;

/// Parse one EVTX chunk (65536 bytes starting with "ElfChnk\0").
/// Returns newline-delimited JSON, one event per line. A record that fails to decode becomes `{"__malformed":true}`
/// so the caller can count it. Returns an error string if the chunk header itself is invalid.
#[wasm_bindgen]
pub fn parse_chunk(data: Vec<u8>) -> Result<String, JsError> {
    // Checksums are not enforced: live logs routinely have a stale checksum on the active chunk.
    let mut chunk = EvtxChunkData::new(data, false).map_err(|e| JsError::new(&format!("invalid chunk: {e}")))?;
    let settings = Arc::new(ParserSettings::default().num_threads(1).indent(false));
    let mut parsed = chunk.parse(settings).map_err(|e| JsError::new(&format!("cannot parse chunk: {e}")))?;
    let mut out = String::new();
    for rec in parsed.iter() {
        match rec.and_then(|r| r.into_json()) {
            Ok(r) => {
                // Compact to a single line regardless of the serializer's formatting.
                let line = serde_json::from_str::<serde_json::Value>(&r.data)
                    .ok()
                    .and_then(|v| serde_json::to_string(&v).ok());
                out.push_str(line.as_deref().unwrap_or("{\"__malformed\":true}"));
            }
            Err(_) => out.push_str("{\"__malformed\":true}"),
        }
        out.push('\n');
    }
    Ok(out)
}

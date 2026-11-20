//! Optional local codec; rawpy/LibRaw executes outside the UI process.
use serde_json::Value;
use std::{
    collections::HashSet,
    io::{Read, Write},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
fn cancelled() -> &'static Mutex<HashSet<String>> {
    static IDS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    IDS.get_or_init(|| Mutex::new(HashSet::new()))
}
#[tauri::command]
pub fn raw_cancel(id: String) {
    cancelled().lock().unwrap().insert(id);
}
fn execute(request: Value, id: String) -> Result<Value, String> {
    let payload = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
    if payload.len() > 24 * 1024 * 1024 {
        return Err("RAW请求超过预算".into());
    }
    let python = std::env::var("DRAIVIO_RAW_PYTHON").unwrap_or_else(|_| "python3".into());
    let mut child = Command::new(python)
        .args(["-c", include_str!("../../scripts/raw/decode.py")])
        .env("OMP_NUM_THREADS", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "需要安装Python 3 / rawpy 0.28 / Pillow".to_string())?;
    let mut input = child.stdin.take().ok_or("RAW输入失败")?;
    let writer = std::thread::spawn(move || input.write_all(&payload));
    let output = child.stdout.take().ok_or("RAW输出失败")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        output
            .take(96 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let start = Instant::now();
    let mut memory_check = Instant::now();
    loop {
        if memory_check.elapsed() > Duration::from_millis(250) {
            memory_check = Instant::now();
            // macOS does not enforce RLIMIT_AS; independently bound the decoder RSS.
            if let Ok(stats) = Command::new("/bin/ps")
                .args(["-o", "rss=", "-p", &child.id().to_string()])
                .output()
            {
                if String::from_utf8_lossy(&stats.stdout)
                    .trim()
                    .parse::<u64>()
                    .unwrap_or(0)
                    > 1536 * 1024
                {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = writer.join();
                    let _ = reader.join();
                    return Err("RAW解码超过1.5GiB进程内存预算".into());
                }
            }
        }
        if cancelled().lock().unwrap().remove(&id) || start.elapsed() > Duration::from_secs(90) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = writer.join();
            let _ = reader.join();
            return Err("RAW解码已取消或超时，原始文件保留".into());
        }
        if child.try_wait().map_err(|e| e.to_string())?.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    writer
        .join()
        .map_err(|_| "RAW输入线程失败")?
        .map_err(|_| "RAW输入失败")?;
    let bytes = reader
        .join()
        .map_err(|_| "RAW输出线程失败")?
        .map_err(|_| "RAW输出失败")?;
    if bytes.len() > 96 * 1024 * 1024 {
        return Err("RAW输出超过预算".into());
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "RAW后端无效；需要安装rawpy与Pillow".to_string())?;
    if let Some(error) = value["error"].as_str() {
        return Err(error.into());
    }
    Ok(value)
}
#[tauri::command]
pub async fn raw_decode(request: Value, id: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || execute(request, id))
        .await
        .map_err(|_| "RAW工作线程失败".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn capabilities_or_clear_missing_dependency() {
        match execute(json!({"operation":"capabilities"}), "capability".into()) {
            Ok(v) => assert_eq!(v["available"], true),
            Err(e) => assert!(e.contains("rawpy") || e.contains("Python")),
        }
    }
    #[test]
    fn rejects_jpeg_and_malformed_raw() {
        assert!(execute(json!({"data":"/9gAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","settings":{"exposureEV":0,"whiteBalance":{"r":1,"g":1,"b":1},"highlightRecovery":0}}),"bad".into()).is_err())
    }
    #[test]
    fn cancelled_work_cannot_publish_result() {
        cancelled().lock().unwrap().insert("cancel-test".into());
        let r = execute(json!({"operation":"capabilities"}), "cancel-test".into());
        assert!(r.unwrap_err().contains("取消"));
    }
}
#[cfg(test)]
mod real_sample_tests {
    use super::*;
    use base64::Engine;
    use serde_json::json;
    fn request() -> Option<Value> {
        let path = std::env::var("DRAIVIO_RAW_SAMPLE").ok()?;
        let bytes = std::fs::read(path).expect("sample read");
        Some(
            json!({"data":base64::engine::general_purpose::STANDARD.encode(bytes),"settings":{"exposureEV":0,"whiteBalance":{"r":1,"g":1,"b":1},"highlightRecovery":0}}),
        )
    }
    #[test]
    fn native_decodes_real_raw_when_sample_provided() {
        let Some(req) = request() else { return };
        let result = execute(req, "real-decode".into()).expect("actual native RAW decode");
        assert_eq!(result["asset"]["format"], "rgba16");
        assert!(result["asset"]["width"].as_u64().unwrap() > 500);
        assert!(
            result["preview"]
                .as_str()
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
        assert!(result["peakRss"].as_u64().unwrap() > 0);
    }
    #[test]
    fn running_real_decoder_is_killed_on_cancel() {
        let Some(req) = request() else { return };
        let worker = std::thread::spawn(move || execute(req, "running-cancel".into()));
        std::thread::sleep(Duration::from_millis(50));
        cancelled().lock().unwrap().insert("running-cancel".into());
        let result = worker.join().unwrap();
        assert!(result.unwrap_err().contains("取消"));
    }
}

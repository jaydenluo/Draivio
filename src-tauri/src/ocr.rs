#[tauri::command]
pub async fn recognize_image_text(image: String) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || recognize(&image)).await.map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = image; Err("本机 OCR 需要 macOS Apple Vision；当前平台尚无识别后端".into()) }
}

#[cfg(target_os = "macos")]
fn recognize(image: &str) -> Result<serde_json::Value, String> {
    use base64::Engine;
    use std::{io::{Read, Write}, os::unix::fs::PermissionsExt, process::{Command, Stdio}, time::{Duration, Instant}};
    if image.len() > 32 * 1024 * 1024 { return Err("OCR 图像超过 24MB".into()); }
    let encoded = image.strip_prefix("data:image/png;base64,").ok_or("OCR 只接受 PNG 图像")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|_| "OCR PNG 编码无效")?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return Err("OCR PNG 格式无效".into()); }
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let path = dir.path().join("draivio-vision");
    std::fs::write(&path, include_bytes!(concat!(env!("OUT_DIR"), "/draivio-vision"))).map_err(|e| e.to_string())?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    let mut child = Command::new(&path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    // Drain both pipes concurrently: a long candidate list must not block the child before wait.
    let stdout = child.stdout.take().unwrap(); let stderr = child.stderr.take().unwrap();
    let out_thread = std::thread::spawn(move || { let mut data=Vec::new(); stdout.take(2*1024*1024).read_to_end(&mut data).map(|_|data) });
    let err_thread = std::thread::spawn(move || { let mut data=String::new(); stderr.take(8192).read_to_string(&mut data).map(|_|data) });
    let input = child.stdin.take().unwrap();
    let input_thread = std::thread::spawn(move || { let mut input=input; input.write_all(&bytes) });
    let start=Instant::now();
    let status=loop { if let Some(s)=child.try_wait().map_err(|e|e.to_string())? { break s; } if start.elapsed()>Duration::from_secs(30) { let _=child.kill(); let _=child.wait(); return Err("本机 OCR 超时（30秒）".into()); } std::thread::sleep(Duration::from_millis(20)); };
    input_thread.join().map_err(|_|"OCR 输入线程失败")?.map_err(|e|e.to_string())?;
    let output=out_thread.join().map_err(|_|"OCR 输出线程失败")?.map_err(|e|e.to_string())?;
    let error=err_thread.join().map_err(|_|"OCR 错误线程失败")?.map_err(|e|e.to_string())?;
    if !status.success() { return Err(error); }
    serde_json::from_slice(&output).map_err(|e|format!("OCR 响应无效：{e}"))
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use base64::Engine;
    #[test]
    fn recognizes_authored_chinese_prices_through_embedded_helper() {
        let fixture=include_bytes!("../../docs/evidence/ocr-native/before.png");
        let input=format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(fixture));
        let result=recognize(&input).expect("real Apple Vision inference");
        assert_eq!(result["width"],900);
        let candidates=result["candidates"].as_array().unwrap();
        assert!(candidates.iter().any(|c|c["text"]=="夏日优惠"));
        assert!(candidates.iter().filter(|c|c["text"]=="¥99").count()>=2);
        assert!(recognize("data:image/png;base64,invalid").is_err());
    }
}

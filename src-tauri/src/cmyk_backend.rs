//! Optional, local Python/Pillow bridge. No shell, scripts or profile paths come from IPC.
use std::io::Write;
use std::process::{Command, Stdio};
use serde_json::Value;
const SCRIPT: &str = include_str!("../../scripts/cmyk_bridge.py");
pub fn execute(request: Value) -> Result<Value,String> {
    let payload=serde_json::to_vec(&request).map_err(|_|"CMYK 请求无效")?;
    if payload.len()>96*1024*1024 { return Err("CMYK 请求超出内存预算".into()); }
    let mut child=Command::new("python3").arg("-c").arg(SCRIPT)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()
        .map_err(|_|"本机没有 Python 3；CMYK 需要安装 Python 3 和带 LittleCMS2/libtiff 的 Pillow".to_string())?;
    child.stdin.take().ok_or("CMYK 后端输入不可用")?.write_all(&payload).map_err(|_|"CMYK 后端输入失败")?;
    let output=child.wait_with_output().map_err(|_|"CMYK 后端执行失败")?;
    if output.stdout.len()>128*1024*1024 { return Err("CMYK 输出超出内存预算".into()); }
    let value: Value=serde_json::from_slice(&output.stdout).map_err(|_|"本机 Pillow 不可用；请安装带 LittleCMS2/libtiff 的 Pillow".to_string())?;
    if let Some(error)=value.get("error").and_then(Value::as_str) { return Err(format!("CMYK：{error}")); }
    if !output.status.success() { return Err("CMYK 后端转换失败".into()); }
    Ok(value)
}
#[tauri::command]
pub async fn cmyk_process(request: Value) -> Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move||execute(request)).await.map_err(|_|"CMYK 工作线程失败".to_string())?
}
#[cfg(test)] mod tests {
 use super::*; use serde_json::json;
 #[test] fn real_cmyk_bridge_roundtrip_when_local_dependencies_present() {
    let capabilities=execute(json!({"operation":"capabilities"})).expect("local Python/Pillow capability check");
    if capabilities["systemProfile"] != true {return;} // Other platforms require a user-supplied print profile.
    let result=execute(json!({"operation":"convert","width":1,"height":1,"data":"AAAA/w=="})).expect("ICC RGB to CMYK");
    let output=execute(json!({"operation":"export","width":1,"height":1,"data":result["data"],"profile":result["profile"]})).expect("ICC CMYK TIFF encode and independent decode");
    assert_eq!(output["verifiedChannels"],4);assert_eq!(output["data"],result["data"]);assert!(output["tiff"].as_str().unwrap().len()>100);
 }
 #[test] fn rejects_unknown_operation_without_shell_execution() { assert!(execute(json!({"operation":"not-allowed","width":1,"height":1,"data":"AAAAAA=="})).is_err()); }
 #[test] fn local_backend_exposes_real_capabilities() { let result=execute(json!({"operation":"capabilities"})); if let Ok(value)=result {assert_eq!(value["available"],true);assert!(value["backend"].as_str().unwrap().contains("LittleCMS"));} }
}

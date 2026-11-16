use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;
use crate::network;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceConnection {
    id: String,
    provider: String,
    name: String,
    base_url: String,
    api_key: String,
    protocol: String,
    models: Vec<String>,
    enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    generation: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model_generation: Option<serde_json::Value>,
}

fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let folder = app.path().app_data_dir().map_err(|_| "无法定位本地配置目录")?;
    std::fs::create_dir_all(&folder).map_err(|_| "无法创建本地配置目录")?;
    let db = Connection::open(folder.join("service-connections.sqlite")).map_err(|_| "无法打开本地配置数据库")?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS service_connections (id TEXT PRIMARY KEY, config TEXT NOT NULL);").map_err(|_| "无法初始化配置数据库")?;
    Ok(db)
}

#[tauri::command]
pub fn load_service_connections(app: tauri::AppHandle) -> Result<Vec<ServiceConnection>, String> {
    let db = database(&app)?;
    let mut statement = db.prepare("SELECT config FROM service_connections ORDER BY rowid").map_err(|_| "无法读取来源配置")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|_| "无法读取来源配置")?;
    rows.map(|row| serde_json::from_str(&row.map_err(|_| "无法读取来源配置")?).map_err(|_| "来源配置损坏".to_string())).collect()
}

fn write_connections(db: &mut Connection, connections: &[ServiceConnection]) -> Result<(), String> {
    let transaction = db.transaction().map_err(|_| "无法开始保存配置")?;
    transaction.execute("DELETE FROM service_connections", []).map_err(|_| "无法更新来源配置")?;
    for connection in connections {
        let config = serde_json::to_string(connection).map_err(|_| "无法编码来源配置")?;
        transaction.execute("INSERT INTO service_connections (id, config) VALUES (?1, ?2)", params![connection.id, config]).map_err(|_| "无法保存来源配置")?;
    }
    transaction.commit().map_err(|_| "无法完成配置保存".to_string())
}

#[tauri::command]
pub fn save_service_connections(app: tauri::AppHandle, connections: Vec<ServiceConnection>) -> Result<(), String> {
    write_connections(&mut database(&app)?, &connections)
}

fn model_list_request(client: &reqwest::Client, base_url: &str, api_key: &str, protocol: &str) -> Result<(reqwest::RequestBuilder, &'static str), String> {
    let request = client.get(format!("{}/models", base_url.trim_end_matches('/')));
    match protocol {
        "openai_compatible" | "volcengine" => Ok((request.bearer_auth(api_key), "data")),
        "gemini" => Ok((request.header("x-goog-api-key", api_key), "models")),
        _ => Err("该协议不提供免费模型列表测试；可保存配置，生图权限以实际请求为准".into()),
    }
}

fn model_page(value: &serde_json::Value, gemini: bool) -> Result<(Vec<String>, Option<String>), String> {
    let data = value.get(if gemini { "models" } else { "data" }).and_then(|value| value.as_array()).ok_or("接口未返回兼容的模型列表，请核对地址和协议")?;
    let ids: Vec<String> = data.iter().filter_map(|item| item.get(if gemini { "name" } else { "id" }).and_then(|value| value.as_str())).map(|id| if gemini { id.trim().strip_prefix("models/").unwrap_or(id.trim()).to_string() } else { id.trim().to_string() }).filter(|id| !id.is_empty()).collect();
    let next = if gemini { value.get("nextPageToken").filter(|v| !v.is_null() && v.as_str() != Some("")) } else if value.get("has_more").and_then(|v| v.as_bool()) == Some(true) { Some(value.get("last_id").or_else(|| data.last().and_then(|v| v.get("id"))).ok_or("模型列表分页异常")?) } else { None };
    let cursor = next.map(|v| v.as_str().filter(|v| !v.trim().is_empty()).map(str::to_string).ok_or("模型列表分页异常".to_string())).transpose()?;
    Ok((ids, cursor))
}

#[tauri::command]
pub async fn fetch_service_models(base_url: String, api_key: String, protocol: Option<String>) -> Result<Vec<String>, String> {
    let url = reqwest::Url::parse(&base_url).map_err(|_| "无效接口地址")?;
    if !["https", "http"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return Err("请填写有效的 HTTP(S) 接口地址".into()); }
    let client = network::client(10)?;
    let protocol = protocol.as_deref().unwrap_or("openai_compatible");
    let gemini = protocol == "gemini";
    let mut ids = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut seen_cursors = std::collections::HashSet::new();
    let mut cursor: Option<String> = None;
    for _ in 0..20 {
        let (mut request, _) = model_list_request(&client, &base_url, &api_key, protocol)?;
        if let Some(ref token) = cursor { request = request.query(&[(if gemini { "pageToken" } else { "after" }, token)]); }
        let response = network::send_json(request).await?;
        let status = response.status;
        if status == 401 || status == 403 { return Err("密钥无效或无访问权限".into()); }
        if !(200..300).contains(&status) { return Err(format!("连接失败（HTTP {status}）")); }
        let (page_ids, next) = model_page(&response.body, gemini)?;
        for id in page_ids { if seen_ids.insert(id.clone()) { ids.push(id); } }
        let Some(next) = next else { return Ok(ids); };
        if !seen_cursors.insert(next.clone()) { return Err("模型列表分页异常，请检查供应商接口".into()); }
        cursor = Some(next);
    }
    Err("模型列表超过 20 页，请按供应商文档手动填写模型 ID".into())
}

#[tauri::command]
pub async fn test_service_connection(base_url: String, api_key: String, protocol: Option<String>) -> Result<String, String> {
    fetch_service_models(base_url, api_key, protocol).await?;
    Ok("模型列表可访问；生图权限以实际请求为准".into())
}

pub type ImageResponse = network::JsonResponse;

fn image_request(client: &reqwest::Client, connection: &ServiceConnection, payload: &serde_json::Value) -> Result<reqwest::RequestBuilder, String> {
    if !connection.enabled || !["openai_compatible", "volcengine"].contains(&connection.protocol.as_str()) { return Err("来源不可用或协议尚未接入".into()); }
    let url = reqwest::Url::parse(&connection.base_url).map_err(|_| "接口地址无效")?;
    if !["https", "http"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return Err("接口地址无效".into()); }
    let model = payload.get("model").and_then(|value| value.as_str()).ok_or("缺少模型")?;
    if !connection.models.iter().any(|item| item == model) || payload.get("prompt").and_then(|value| value.as_str()).is_none_or(|value| value.trim().is_empty()) { return Err("请检查模型和提示词".into()); }
    let object = payload.as_object().ok_or("请求格式无效")?;
    if object.keys().any(|key| !["model", "prompt", "n", "size", "quality"].contains(&key.as_str())) { return Err("请求参数无效".into()); }
    if let Some(n) = payload.get("n") { if n.as_u64().is_none_or(|n| !(1..=8).contains(&n)) { return Err("数量无效".into()); } }
    Ok(client.post(format!("{}/images/generations", connection.base_url.trim_end_matches('/'))).bearer_auth(&connection.api_key).json(payload))
}

#[tauri::command]
pub async fn generate_openai_images(app: tauri::AppHandle, connection_id: String, payload: serde_json::Value) -> Result<ImageResponse, String> {
    let connection = load_service_connections(app)?.into_iter().find(|connection| connection.id == connection_id).ok_or("来源已删除")?;
    let client = network::client(180)?;
    network::send_json(image_request(&client, &connection, &payload)?).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::retry_after as image_retry_after;
    #[test]
    fn extracts_model_ids_and_pagination_for_both_protocols() {
        let (ids, next) = model_page(&serde_json::json!({"data":[{"id":"image-a"},{"id":"image-b"}],"has_more":true}), false).unwrap();
        assert_eq!(ids, vec!["image-a", "image-b"]);
        assert_eq!(next.as_deref(), Some("image-b"));
        let (ids, next) = model_page(&serde_json::json!({"models":[{"name":"models/gemini-image"}],"nextPageToken":"next token"}), true).unwrap();
        assert_eq!(ids, vec!["gemini-image"]);
        assert_eq!(next.as_deref(), Some("next token"));
        assert!(model_page(&serde_json::json!({"data":[],"has_more":true}), false).is_err());
        assert!(model_page(&serde_json::json!({"data":"invalid"}), false).is_err());
    }
    #[test]
    fn retry_after_accepts_seconds_and_http_dates_with_a_cap() {
        let now = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1700000000);
        assert_eq!(image_retry_after(Some("3"), now), 3000);
        assert_eq!(image_retry_after(Some("99999"), now), 60000);
        let future = httpdate::fmt_http_date(now + std::time::Duration::from_secs(30));
        assert_eq!(image_retry_after(Some(&future), now), 30000);
        assert_eq!(image_retry_after(Some("invalid"), now), 1000);
    }
    #[test]
    fn image_generation_preserves_options_and_builds_authenticated_request() {
        let raw = serde_json::json!({"id":"one","provider":"OpenAI","name":"proxy","baseUrl":"https://example.com/v1/","apiKey":"test-only","protocol":"openai_compatible","models":["image"],"enabled":true,"generation":{"multiImage":"split","concurrency":2},"modelGeneration":{"image":{"sendSize":false}}});
        let connection: ServiceConnection = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(serde_json::to_value(&connection).unwrap(), raw);
        let client = reqwest::Client::new();
        let payload = serde_json::json!({"model":"image","prompt":"draw"});
        let request = image_request(&client, &connection, &payload).unwrap().build().unwrap();
        assert_eq!(request.url().as_str(), "https://example.com/v1/images/generations");
        assert_eq!(request.headers()["authorization"], "Bearer test-only");
        assert_eq!(serde_json::from_slice::<serde_json::Value>(request.body().unwrap().as_bytes().unwrap()).unwrap(), payload);
        assert!(image_request(&client, &connection, &serde_json::json!({"model":"other","prompt":"draw"})).is_err());
        assert!(image_request(&client, &connection, &serde_json::json!({"model":"image","prompt":"draw","n":20})).is_err());
    }
    #[test]
    fn model_list_protocol_headers_and_response_fields() {
        let client = reqwest::Client::new();
        for protocol in ["openai_compatible", "volcengine", "gemini"] {
            let (builder, field) = model_list_request(&client, "https://example.com/v1/", "test-only", protocol).unwrap();
            let request = builder.build().unwrap();
            assert_eq!(request.url().as_str(), "https://example.com/v1/models");
            if protocol == "gemini" {
                assert_eq!(field, "models");
                assert_eq!(request.headers()["x-goog-api-key"], "test-only");
                assert!(!request.headers().contains_key("authorization"));
            } else {
                assert_eq!(field, "data");
                assert_eq!(request.headers()["authorization"], "Bearer test-only");
            }
        }
        for protocol in ["dashscope", "bfl", "stability", "native", "unknown"] {
            assert!(model_list_request(&client, "https://example.com", "test-only", protocol).is_err());
        }
    }
    #[test]
    fn persists_multiple_accounts_and_rolls_back_failed_updates() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE service_connections (id TEXT PRIMARY KEY, config TEXT NOT NULL);").unwrap();
        let make = |id: &str| ServiceConnection { id: id.into(), provider: "OpenAI".into(), name: id.into(), base_url: "https://example.com/v1".into(), api_key: "test-only".into(), protocol: "openai_compatible".into(), models: vec!["image".into()], enabled: true, generation: Some(serde_json::json!({"multiImage":"split","concurrency":2})), model_generation: None };
        write_connections(&mut db, &[make("personal"), make("work")]).unwrap();
        assert_eq!(db.query_row::<i64, _, _>("SELECT COUNT(*) FROM service_connections", [], |row| row.get(0)).unwrap(), 2);
        assert!(write_connections(&mut db, &[make("same"), make("same")]).is_err());
        assert_eq!(db.query_row::<i64, _, _>("SELECT COUNT(*) FROM service_connections", [], |row| row.get(0)).unwrap(), 2);
        write_connections(&mut db, &[]).unwrap();
        assert_eq!(db.query_row::<i64, _, _>("SELECT COUNT(*) FROM service_connections", [], |row| row.get(0)).unwrap(), 0);
    }
}

use crate::network;
#[cfg(test)]
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelCapabilities {
    image: bool,
    text: bool,
    vision: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(Clone)]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    model_capabilities: Option<std::collections::BTreeMap<String, ModelCapabilities>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    assistant_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image_capabilities: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image_pricing: Option<serde_json::Value>,
}

fn memory_connections() -> &'static Mutex<Vec<ServiceConnection>> {
    static STORE: OnceLock<Mutex<Vec<ServiceConnection>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(Vec::new()))
}

fn remove_legacy_database(app: &tauri::AppHandle) {
    if let Ok(folder) = app.path().app_data_dir() {
        let _ = std::fs::remove_file(folder.join("service-connections.sqlite"));
    }
}

#[cfg(test)]
fn database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let folder = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法定位本地配置目录")?;
    std::fs::create_dir_all(&folder).map_err(|_| "无法创建本地配置目录")?;
    let db = Connection::open(folder.join("service-connections.sqlite"))
        .map_err(|_| "无法打开本地配置数据库")?;
    db.execute_batch("CREATE TABLE IF NOT EXISTS service_connections (id TEXT PRIMARY KEY, config TEXT NOT NULL);").map_err(|_| "无法初始化配置数据库")?;
    Ok(db)
}

#[tauri::command]
pub fn load_service_connections(app: tauri::AppHandle) -> Result<Vec<ServiceConnection>, String> {
    remove_legacy_database(&app);
    memory_connections()
        .lock()
        .map(|items| items.clone())
        .map_err(|_| "无法读取会话来源配置".into())
}

#[cfg(test)]
fn write_connections(db: &mut Connection, connections: &[ServiceConnection]) -> Result<(), String> {
    for connection in connections {
        if connection
            .model_capabilities
            .as_ref()
            .is_some_and(|map| map.keys().any(|model| !connection.models.contains(model)))
        {
            return Err("模型能力配置引用了未选择的模型".into());
        }
        if let Some(model) = &connection.assistant_model {
            if !connection.models.contains(model)
                || !connection
                    .model_capabilities
                    .as_ref()
                    .and_then(|map| map.get(model))
                    .is_some_and(|capability| capability.text)
            {
                return Err("助手模型必须具有声明的文本推理能力".into());
            }
        }
    }
    let transaction = db.transaction().map_err(|_| "无法开始保存配置")?;
    transaction
        .execute("DELETE FROM service_connections", [])
        .map_err(|_| "无法更新来源配置")?;
    for connection in connections {
        let config = serde_json::to_string(connection).map_err(|_| "无法编码来源配置")?;
        transaction
            .execute(
                "INSERT INTO service_connections (id, config) VALUES (?1, ?2)",
                params![connection.id, config],
            )
            .map_err(|_| "无法保存来源配置")?;
    }
    transaction
        .commit()
        .map_err(|_| "无法完成配置保存".to_string())
}

#[tauri::command]
pub fn save_service_connections(
    app: tauri::AppHandle,
    connections: Vec<ServiceConnection>,
) -> Result<(), String> {
    if connections
        .iter()
        .any(|connection| connection.api_key.trim().is_empty())
    {
        return Err("请重新输入服务密钥；桌面端不会持久化密钥".into());
    }
    remove_legacy_database(&app);
    memory_connections()
        .lock()
        .map(|mut items| {
            *items = connections;
        })
        .map_err(|_| "无法保存会话来源配置".into())
}

fn model_list_request(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    protocol: &str,
) -> Result<(reqwest::RequestBuilder, &'static str), String> {
    let request = client.get(format!("{}/models", base_url.trim_end_matches('/')));
    match protocol {
        "openai_compatible" | "volcengine" => Ok((request.bearer_auth(api_key), "data")),
        "gemini" => Ok((request.header("x-goog-api-key", api_key), "models")),
        _ => Err("该协议不提供免费模型列表测试；可保存配置，生图权限以实际请求为准".into()),
    }
}

fn model_page(
    value: &serde_json::Value,
    gemini: bool,
) -> Result<(Vec<String>, Option<String>), String> {
    let data = value
        .get(if gemini { "models" } else { "data" })
        .and_then(|value| value.as_array())
        .ok_or("接口未返回兼容的模型列表，请核对地址和协议")?;
    let ids: Vec<String> = data
        .iter()
        .filter_map(|item| {
            item.get(if gemini { "name" } else { "id" })
                .and_then(|value| value.as_str())
        })
        .map(|id| {
            if gemini {
                id.trim()
                    .strip_prefix("models/")
                    .unwrap_or(id.trim())
                    .to_string()
            } else {
                id.trim().to_string()
            }
        })
        .filter(|id| !id.is_empty())
        .collect();
    let next = if gemini {
        value
            .get("nextPageToken")
            .filter(|v| !v.is_null() && v.as_str() != Some(""))
    } else if value.get("has_more").and_then(|v| v.as_bool()) == Some(true) {
        Some(
            value
                .get("last_id")
                .or_else(|| data.last().and_then(|v| v.get("id")))
                .ok_or("模型列表分页异常")?,
        )
    } else {
        None
    };
    let cursor = next
        .map(|v| {
            v.as_str()
                .filter(|v| !v.trim().is_empty())
                .map(str::to_string)
                .ok_or("模型列表分页异常".to_string())
        })
        .transpose()?;
    Ok((ids, cursor))
}

#[tauri::command]
pub async fn fetch_service_models(
    base_url: String,
    api_key: String,
    protocol: Option<String>,
) -> Result<Vec<String>, String> {
    let url = reqwest::Url::parse(&base_url).map_err(|_| "无效接口地址")?;
    if !["https", "http"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("请填写有效的 HTTP(S) 接口地址".into());
    }
    let client = network::client(10)?;
    let protocol = protocol.as_deref().unwrap_or("openai_compatible");
    let gemini = protocol == "gemini";
    let mut ids = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    let mut seen_cursors = std::collections::HashSet::new();
    let mut cursor: Option<String> = None;
    for _ in 0..20 {
        let (mut request, _) = model_list_request(&client, &base_url, &api_key, protocol)?;
        if let Some(ref token) = cursor {
            request = request.query(&[(if gemini { "pageToken" } else { "after" }, token)]);
        }
        let response = network::send_json(request).await?;
        let status = response.status;
        if status == 401 || status == 403 {
            return Err("密钥无效或无访问权限".into());
        }
        if !(200..300).contains(&status) {
            return Err(format!("连接失败（HTTP {status}）"));
        }
        let (page_ids, next) = model_page(&response.body, gemini)?;
        for id in page_ids {
            if seen_ids.insert(id.clone()) {
                ids.push(id);
            }
        }
        let Some(next) = next else {
            return Ok(ids);
        };
        if !seen_cursors.insert(next.clone()) {
            return Err("模型列表分页异常，请检查供应商接口".into());
        }
        cursor = Some(next);
    }
    Err("模型列表超过 20 页，请按供应商文档手动填写模型 ID".into())
}

#[tauri::command]
pub async fn test_service_connection(
    base_url: String,
    api_key: String,
    protocol: Option<String>,
) -> Result<String, String> {
    fetch_service_models(base_url, api_key, protocol).await?;
    Ok("模型列表可访问；生图权限以实际请求为准".into())
}

pub type ImageResponse = network::JsonResponse;

fn image_request(
    client: &reqwest::Client,
    connection: &ServiceConnection,
    payload: &serde_json::Value,
) -> Result<reqwest::RequestBuilder, String> {
    if !connection.enabled
        || !["openai_compatible", "volcengine"].contains(&connection.protocol.as_str())
    {
        return Err("来源不可用或协议尚未接入".into());
    }
    let url = reqwest::Url::parse(&connection.base_url).map_err(|_| "接口地址无效")?;
    if !["https", "http"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("接口地址无效".into());
    }
    let model = payload
        .get("model")
        .and_then(|value| value.as_str())
        .ok_or("缺少模型")?;
    if !connection.models.iter().any(|item| item == model)
        || payload
            .get("prompt")
            .and_then(|value| value.as_str())
            .is_none_or(|value| value.trim().is_empty())
    {
        return Err("请检查模型和提示词".into());
    }
    let object = payload.as_object().ok_or("请求格式无效")?;
    if object.keys().any(|key| {
        ![
            "model", "prompt", "n", "size", "quality", "strength", "steps", "guidance",
        ]
        .contains(&key.as_str())
    }) {
        return Err("请求参数无效".into());
    }
    if let Some(n) = payload.get("n") {
        if n.as_u64().is_none_or(|n| !(1..=8).contains(&n)) {
            return Err("数量无效".into());
        }
    }
    Ok(client
        .post(format!(
            "{}/images/generations",
            connection.base_url.trim_end_matches('/')
        ))
        .bearer_auth(&connection.api_key)
        .json(payload))
}

fn image_edit_request(
    client: &reqwest::Client,
    connection: &ServiceConnection,
    payload: &serde_json::Value,
    multipart: bool,
) -> Result<reqwest::RequestBuilder, String> {
    use base64::Engine;
    // Reuse URL/source/model validation with a nonempty probe prompt. Empty edit prompts mean removal.
    let model = payload
        .get("model")
        .and_then(|v| v.as_str())
        .ok_or("缺少模型")?;
    let _ = image_request(
        client,
        connection,
        &serde_json::json!({"model":model,"prompt":"edit-validation"}),
    )?;
    let object = payload.as_object().ok_or("请求格式无效")?;
    if object.keys().any(|k| {
        ![
            "model", "prompt", "image", "mask", "n", "size", "quality", "strength", "steps",
            "guidance", "additional_reference",
        ]
        .contains(&k.as_str())
    }) {
        return Err("编辑参数无效".into());
    }
    if payload.get("prompt").and_then(|v| v.as_str()).is_none()
        || payload.get("image").and_then(|v| v.as_str()).is_none()
    {
        return Err("编辑缺少提示或原图".into());
    }
    if let Some(n) = payload.get("n") {
        if n.as_u64().is_none_or(|v| !(1..=8).contains(&v)) {
            return Err("数量无效".into());
        }
    }
    let builder = client
        .post(format!(
            "{}/images/edits",
            connection.base_url.trim_end_matches('/')
        ))
        .bearer_auth(&connection.api_key);
    if !multipart {
        let mut body = payload.clone();
        if let Some(extra) = body.as_object_mut().and_then(|o| o.remove("additional_reference")) {
            body["image"] = serde_json::json!([payload["image"], extra]);
        }
        return Ok(builder.json(&body));
    }
    let dimensions = |key: &str| -> Result<Vec<u8>, String> {
        let encoded = payload
            .get(key)
            .and_then(|v| v.as_str())
            .and_then(|v| v.strip_prefix("data:image/png;base64,"))
            .ok_or("编辑图像必须为 PNG")?;
        if encoded.len() > 48 * 1024 * 1024 {
            return Err("编辑图像过大".into());
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| "PNG 编码无效")?;
        if bytes.len() < 24 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") || &bytes[12..16] != b"IHDR"
        {
            return Err("图像不是 PNG".into());
        }
        if bytes[16..20] == [0, 0, 0, 0] || bytes[20..24] == [0, 0, 0, 0] {
            return Err("PNG 尺寸无效".into());
        }
        Ok(bytes[16..24].to_vec())
    };
    let original_size = dimensions("image")?;
    if payload.get("mask").is_some() && original_size != dimensions("mask")? {
        return Err("参考图与蒙版尺寸必须一致".into());
    }
    let mut form = reqwest::multipart::Form::new();
    let mut fields: Vec<_> = object.iter().collect();
    fields.sort_by_key(|(key, _)| match key.as_str() { "image" => 0, "additional_reference" => 1, _ => 2 });
    for (key, value) in fields {
        if key == "image" || key == "mask" || key == "additional_reference" {
            let encoded = value
                .as_str()
                .and_then(|v| v.strip_prefix("data:image/png;base64,"))
                .ok_or("编辑图像必须为 PNG")?;
            if encoded.len() > 48 * 1024 * 1024 {
                return Err("编辑图像过大".into());
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| "PNG 编码无效")?;
            if bytes.len() < 24
                || !bytes.starts_with(b"\x89PNG\r\n\x1a\n")
                || &bytes[12..16] != b"IHDR"
            {
                return Err("图像不是 PNG".into());
            }
            let part = reqwest::multipart::Part::bytes(bytes)
                .file_name(format!("{key}.png"))
                .mime_str("image/png")
                .map_err(|_| "PNG 类型无效")?;
            let field = if key == "additional_reference" || key == "image" && payload.get("additional_reference").is_some() { "image[]".to_string() } else { key.clone() };
            form = form.part(field, part);
        } else {
            form = form.text(
                key.clone(),
                value
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| value.to_string()),
            );
        }
    }
    Ok(builder.multipart(form))
}

#[tauri::command]
pub async fn generate_openai_images(
    app: tauri::AppHandle,
    connection_id: String,
    payload: serde_json::Value,
    path: Option<String>,
    multipart: Option<bool>,
) -> Result<ImageResponse, String> {
    let connection = load_service_connections(app)?
        .into_iter()
        .find(|connection| connection.id == connection_id)
        .ok_or("来源已删除")?;
    let client = network::client(180)?;
    let request = match path.as_deref().unwrap_or("images/generations") {
        "images/generations" => image_request(&client, &connection, &payload)?,
        "images/edits" => {
            image_edit_request(&client, &connection, &payload, multipart.unwrap_or(false))?
        }
        _ => return Err("图片请求路径无效".into()),
    };
    network::send_json(request).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::network::retry_after as image_retry_after;
    #[test]
    fn extracts_model_ids_and_pagination_for_both_protocols() {
        let (ids, next) = model_page(
            &serde_json::json!({"data":[{"id":"image-a"},{"id":"image-b"}],"has_more":true}),
            false,
        )
        .unwrap();
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
    fn masked_edits_use_edit_endpoint_png_parts_and_allow_empty_removal_prompt() {
        let connection: ServiceConnection=serde_json::from_value(serde_json::json!({"id":"one","provider":"OpenAI","name":"proxy","baseUrl":"https://example.com/v1","apiKey":"test-only","protocol":"openai_compatible","models":["gpt-image-1"],"enabled":true})).unwrap();
        let client = reqwest::Client::new();
        let png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==";
        for prompt in ["", "replace with a flower"] {
            let payload =
                serde_json::json!({"model":"gpt-image-1","prompt":prompt,"image":png,"mask":png});
            let request = image_edit_request(&client, &connection, &payload, true)
                .unwrap()
                .build()
                .unwrap();
            assert_eq!(
                request.url().as_str(),
                "https://example.com/v1/images/edits"
            );
            assert!(
                request.headers()["content-type"]
                    .to_str()
                    .unwrap()
                    .starts_with("multipart/form-data; boundary=")
            );
            assert_eq!(request.headers()["authorization"], "Bearer test-only");
        }
        assert!(image_edit_request(&client,&connection,&serde_json::json!({"model":"gpt-image-1","prompt":"","image":"not-png","mask":png}),true).is_err());
        let reference = serde_json::json!({"model":"gpt-image-1","prompt":"reference","image":png});
        let request = image_edit_request(&client, &connection, &reference, true)
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(
            request.url().as_str(),
            "https://example.com/v1/images/edits"
        );
        assert!(
            request.headers()["content-type"]
                .to_str()
                .unwrap()
                .starts_with("multipart/form-data; boundary=")
        );
        let json = image_edit_request(&client, &connection, &reference, false)
            .unwrap()
            .build()
            .unwrap();
        let multiple = serde_json::json!({"model":"gpt-image-1","prompt":"reference","image":png,"additional_reference":png,"mask":png});
        assert!(image_edit_request(&client, &connection, &multiple, true).unwrap().build().is_ok());
        let json_multiple = image_edit_request(&client, &connection, &multiple, false).unwrap().build().unwrap();
        let body: serde_json::Value = serde_json::from_slice(json_multiple.body().unwrap().as_bytes().unwrap()).unwrap();
        assert_eq!(body["image"], serde_json::json!([png, png]));
        assert!(body.get("additional_reference").is_none());
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(json.body().unwrap().as_bytes().unwrap())
                .unwrap(),
            reference
        );
        assert!(image_edit_request(&client,&connection,&serde_json::json!({"model":"gpt-image-1","prompt":"reference","image":"data:image/png;base64,AAAA"}),true).is_err());
    }
    #[test]
    fn image_generation_preserves_options_and_builds_authenticated_request() {
        let raw = serde_json::json!({"id":"one","provider":"OpenAI","name":"proxy","baseUrl":"https://example.com/v1/","apiKey":"test-only","protocol":"openai_compatible","models":["image"],"enabled":true,"generation":{"multiImage":"split","concurrency":2},"modelGeneration":{"image":{"sendSize":false}}});
        let connection: ServiceConnection = serde_json::from_value(raw.clone()).unwrap();
        assert_eq!(serde_json::to_value(&connection).unwrap(), raw);
        let client = reqwest::Client::new();
        let payload = serde_json::json!({"model":"image","prompt":"draw","steps":20,"guidance":7,"strength":0.5});
        let request = image_request(&client, &connection, &payload)
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(
            request.url().as_str(),
            "https://example.com/v1/images/generations"
        );
        assert_eq!(request.headers()["authorization"], "Bearer test-only");
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(
                request.body().unwrap().as_bytes().unwrap()
            )
            .unwrap(),
            payload
        );
        assert!(
            image_request(
                &client,
                &connection,
                &serde_json::json!({"model":"other","prompt":"draw"})
            )
            .is_err()
        );
        assert!(
            image_request(
                &client,
                &connection,
                &serde_json::json!({"model":"image","prompt":"draw","n":20})
            )
            .is_err()
        );
    }
    #[test]
    fn model_list_protocol_headers_and_response_fields() {
        let client = reqwest::Client::new();
        for protocol in ["openai_compatible", "volcengine", "gemini"] {
            let (builder, field) =
                model_list_request(&client, "https://example.com/v1/", "test-only", protocol)
                    .unwrap();
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
            assert!(
                model_list_request(&client, "https://example.com", "test-only", protocol).is_err()
            );
        }
    }
    #[test]
    fn assistant_capabilities_survive_native_storage_and_legacy_rows() {
        let raw = serde_json::json!({"id":"one","provider":"OpenAI","name":"personal","baseUrl":"https://example.com/v1","apiKey":"test-only","protocol":"openai_compatible","models":["image-z","chat","image-a"],"enabled":true,"modelCapabilities":{"chat":{"image":false,"text":true,"vision":true}},"assistantModel":"chat"});
        let connection: ServiceConnection = serde_json::from_value(raw.clone()).unwrap();
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE service_connections (id TEXT PRIMARY KEY, config TEXT NOT NULL);",
        )
        .unwrap();
        write_connections(&mut db, &[connection]).unwrap();
        let stored: String = db
            .query_row("SELECT config FROM service_connections", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&stored).unwrap(),
            raw
        );
        let mut legacy = raw.clone();
        legacy.as_object_mut().unwrap().remove("modelCapabilities");
        legacy.as_object_mut().unwrap().remove("assistantModel");
        let legacy_connection: ServiceConnection = serde_json::from_value(legacy.clone()).unwrap();
        assert_eq!(serde_json::to_value(legacy_connection).unwrap(), legacy);
        let mut invalid = raw;
        invalid["modelCapabilities"]["chat"]["text"] = serde_json::json!("yes");
        assert!(serde_json::from_value::<ServiceConnection>(invalid).is_err());
    }
    #[test]
    fn persists_multiple_accounts_and_rolls_back_failed_updates() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE service_connections (id TEXT PRIMARY KEY, config TEXT NOT NULL);",
        )
        .unwrap();
        let make = |id: &str| ServiceConnection {
            id: id.into(),
            provider: "OpenAI".into(),
            name: id.into(),
            base_url: "https://example.com/v1".into(),
            api_key: "test-only".into(),
            protocol: "openai_compatible".into(),
            models: vec!["image".into()],
            enabled: true,
            generation: Some(serde_json::json!({"multiImage":"split","concurrency":2})),
            model_generation: None,
            model_capabilities: None,
            assistant_model: None,
            image_capabilities: None,
            image_pricing: None,
        };
        write_connections(&mut db, &[make("personal"), make("work")]).unwrap();
        assert_eq!(
            db.query_row::<i64, _, _>("SELECT COUNT(*) FROM service_connections", [], |row| row
                .get(0))
                .unwrap(),
            2
        );
        assert!(write_connections(&mut db, &[make("same"), make("same")]).is_err());
        assert_eq!(
            db.query_row::<i64, _, _>("SELECT COUNT(*) FROM service_connections", [], |row| row
                .get(0))
                .unwrap(),
            2
        );
        write_connections(&mut db, &[]).unwrap();
        assert_eq!(
            db.query_row::<i64, _, _>("SELECT COUNT(*) FROM service_connections", [], |row| row
                .get(0))
                .unwrap(),
            0
        );
    }
}

use crate::network::{JsonResponse, client, retry_after};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudOptions {
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: Value,
    #[serde(default = "default_timeout")]
    timeout_ms: u64,
    #[serde(default = "default_limit")]
    max_response_bytes: usize,
}
fn default_timeout() -> u64 {
    10_000
}
fn default_limit() -> usize {
    64 * 1024 * 1024
}

fn validate(origin: &str, path: &str, method: &str) -> Result<(), String> {
    // Origin is user-configurable; allow HTTPS or explicit loopback HTTP only.
    let parsed = reqwest::Url::parse(origin).map_err(|_| "INVALID_CLOUD_ORIGIN")?;
    let loopback = matches!(
        parsed.host_str(),
        Some("127.0.0.1" | "localhost" | "[::1]" | "::1")
    );
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
        || parsed.path() != "/"
        || !(parsed.scheme() == "https" || (parsed.scheme() == "http" && loopback))
    {
        return Err("INVALID_CLOUD_ORIGIN".into());
    }
    let read = matches!(
        path,
        "/api/auth/me"
            | "/api/account/overview"
            | "/api/account/payment-methods"
            | "/api/model-gateway/v1/models"
            | "/api/model-gateway/v1/balance"
    ) || path
        .strip_prefix("/api/account/payment-orders/")
        .map(|id| {
            !id.is_empty()
                && id.len() <= 100
                && id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        })
        .unwrap_or(false);
    let write = matches!(
        path,
        "/api/auth/register"
            | "/api/auth/email-codes"
            | "/api/auth/email-codes/verify"
            | "/api/auth/password-login"
            | "/api/auth/password-reset"
            | "/api/auth/password-reset/codes"
            | "/api/auth/refresh"
            | "/api/auth/logout"
            | "/api/account/vouchers/redeem"
            | "/api/account/payment-orders"
            | "/api/model-gateway/v1/quotes"
            | "/api/model-gateway/v1/images/generations"
            | "/api/model-gateway/v1/images/edits"
            | "/api/model-gateway/v1/chat/completions"
    );
    if (method == "GET" && read) || (method == "POST" && write) {
        Ok(())
    } else {
        Err("INVALID_CLOUD_PATH".into())
    }
}
fn safe_error(body: &Value, status: u16) -> Value {
    let code = body
        .get("code")
        .or_else(|| body.get("error").and_then(|e| e.get("code")))
        .and_then(Value::as_str)
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 64
                && s.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'-'))
        })
        .map(str::to_owned)
        .unwrap_or_else(|| format!("HTTP_{status}"));
    json!({"code": code})
}
async fn send_cloud(
    origin: &str,
    path: &str,
    options: CloudOptions,
) -> Result<JsonResponse, String> {
    use futures_util::StreamExt;
    let timeout = options.timeout_ms.clamp(1, 300_000);
    let mut request = client(timeout.div_ceil(1000))?
        .request(
            if options.method == "POST" {
                reqwest::Method::POST
            } else {
                reqwest::Method::GET
            },
            format!("{origin}{path}"),
        )
        .timeout(std::time::Duration::from_millis(timeout))
        .header("X-MOVIVIZ-Client", "desktop");
    for (name, value) in &options.headers {
        if matches!(
            name.to_ascii_lowercase().as_str(),
            "authorization" | "idempotency-key" | "x-request-id"
        ) {
            let key = reqwest::header::HeaderName::from_bytes(name.as_bytes())
                .map_err(|_| "INVALID_CLOUD_HEADER")?;
            let value = reqwest::header::HeaderValue::from_str(value)
                .map_err(|_| "INVALID_CLOUD_HEADER")?;
            request = request.header(key, value);
        }
    }
    if !options.body.is_null() {
        request = request.json(&options.body);
    }
    let response = request.send().await.map_err(|e| {
        if e.is_timeout() {
            "CLOUD_TIMEOUT"
        } else {
            "CLOUD_NETWORK_UNAVAILABLE"
        }
    })?;
    let status = response.status().as_u16();
    let retry_after = retry_after(
        response
            .headers()
            .get("retry-after")
            .and_then(|h| h.to_str().ok()),
        std::time::SystemTime::now(),
    );
    let success = response.status().is_success();
    let limit = if success {
        options.max_response_bytes.clamp(1, 64 * 1024 * 1024)
    } else {
        8192
    };
    if response
        .content_length()
        .map(|n| n > limit as u64)
        .unwrap_or(false)
    {
        if success {
            return Err("CLOUD_RESPONSE_TOO_LARGE".into());
        }
        return Ok(JsonResponse {
            status,
            body: safe_error(&Value::Null, status),
            retry_after,
        });
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "CLOUD_RESPONSE_INTERRUPTED")?;
        if bytes.len().saturating_add(chunk.len()) > limit {
            if success {
                return Err("CLOUD_RESPONSE_TOO_LARGE".into());
            }
            return Ok(JsonResponse {
                status,
                body: safe_error(&Value::Null, status),
                retry_after,
            });
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = if status == 204 {
        Value::Null
    } else if success {
        serde_json::from_slice(&bytes).map_err(|_| "INVALID_CLOUD_RESPONSE")?
    } else {
        safe_error(
            &serde_json::from_slice(&bytes).unwrap_or(Value::Null),
            status,
        )
    };
    Ok(JsonResponse {
        status,
        body,
        retry_after,
    })
}

/// JSON only; one attempt, no redirects, no persistence or raw response/error logging.
#[tauri::command]
pub async fn cloud_account_request(
    origin: String,
    path: String,
    options: CloudOptions,
) -> Result<JsonResponse, String> {
    validate(&origin, &path, &options.method)?;
    send_cloud(&origin, &path, options).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_origin_paths_and_methods() {
        assert!(
            validate(
                "https://www.moviviz.com",
                "/api/auth/password-login",
                "POST"
            )
            .is_ok()
        );
        assert!(validate("https://www.moviviz.com", "/api/auth/register", "POST").is_ok());
        assert!(validate("https://www.moviviz.com", "/api/auth/register", "GET").is_err());
        assert!(
            validate(
                "https://configured-cloud.test",
                "/api/auth/password-reset/codes",
                "POST"
            )
            .is_ok()
        );
        assert!(validate("http://localhost:1234", "/api/auth/password-login", "POST").is_ok());
        for origin in [
            "https://user:pass@cloud.test",
            "https://cloud.test/api",
            "https://cloud.test?token=secret",
            "https://cloud.test/#token",
        ] {
            assert!(validate(origin, "/api/auth/password-login", "POST").is_err());
        }
        assert!(
            validate(
                "http://public-insecure.test",
                "/api/auth/password-login",
                "POST"
            )
            .is_err()
        );
        for path in [
            "//attacker.test/api/auth/me",
            "/api/auth/me?token=secret",
            "/api/../admin",
            "/api/auth/refresh/extra",
            "/api/admin",
        ] {
            assert!(validate("https://www.moviviz.com", path, "GET").is_err());
        }
        assert!(validate("https://www.moviviz.com", "/api/auth/me", "POST").is_err());
    }
    #[test]
    fn errors_only_keep_a_short_structured_code() {
        assert_eq!(
            safe_error(
                &serde_json::json!({"error":{"code":"INSUFFICIENT_CREDITS","message":"private-token"}}),
                402
            ),
            serde_json::json!({"code":"INSUFFICIENT_CREDITS"})
        );
        assert_eq!(
            safe_error(&serde_json::json!({"code":"private token"}), 403),
            serde_json::json!({"code":"HTTP_403"})
        );
    }
    #[test]
    fn local_http_preserves_code_status_and_idempotency_without_echoing_error_text() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut bytes = [0; 8192];
            let length = socket.read(&mut bytes).unwrap();
            let headers = String::from_utf8_lossy(&bytes[..length]).to_ascii_lowercase();
            assert!(headers.contains("idempotency-key: operation-123"));
            assert!(headers.contains("x-moviviz-client: desktop"));
            assert!(!headers.contains("x-untrusted:"));
            let body = r#"{"error":{"code":"INSUFFICIENT_CREDITS","message":"private-token"}}"#;
            write!(socket, "HTTP/1.1 402 Payment Required\r\nContent-Type: application/json\r\nRetry-After: 3\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let options = CloudOptions {
            method: "POST".into(),
            headers: HashMap::from([
                ("Idempotency-Key".into(), "operation-123".into()),
                ("X-Untrusted".into(), "ignored".into()),
            ]),
            body: json!({"prompt":"fixture"}),
            timeout_ms: 1000,
            max_response_bytes: 1024,
        };
        let result = tauri::async_runtime::block_on(send_cloud(
            &origin,
            "/api/model-gateway/v1/images/generations",
            options,
        ))
        .unwrap();
        server.join().unwrap();
        assert_eq!(result.status, 402);
        assert_eq!(result.retry_after, 3000);
        assert_eq!(result.body, json!({"code":"INSUFFICIENT_CREDITS"}));
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn session_entry(origin: &str) -> Result<keyring::Entry, String> {
    validate(origin, "/api/auth/refresh", "POST")?;
    let origin = reqwest::Url::parse(origin).map_err(|_| "INVALID_CLOUD_ORIGIN")?;
    keyring::Entry::new(
        "com.draivio.app.cloud-session",
        &origin.origin().ascii_serialization(),
    )
    .map_err(|_| "CLOUD_SESSION_STORAGE_UNAVAILABLE".into())
}

#[tauri::command]
pub async fn cloud_session_read(origin: String) -> Result<Option<String>, String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return tauri::async_runtime::spawn_blocking(move || {
        match session_entry(&origin)?.get_secret() {
            Ok(secret) => String::from_utf8(secret)
                .map(Some)
                .map_err(|_| "INVALID_SAVED_SESSION".into()),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("CLOUD_SESSION_STORAGE_UNAVAILABLE".into()),
        }
    })
    .await
    .map_err(|_| "CLOUD_SESSION_STORAGE_UNAVAILABLE")?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = origin;
        Ok(None)
    }
}

#[tauri::command]
pub async fn cloud_session_write(origin: String, token: Option<String>) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return tauri::async_runtime::spawn_blocking(move || {
        let entry = session_entry(&origin)?;
        if token
            .as_ref()
            .is_some_and(|value| value.is_empty() || value.len() > 2048)
        {
            return Err("INVALID_SAVED_SESSION".into());
        }
        let result = match token {
            Some(value) => entry.set_secret(value.as_bytes()),
            None => match entry.delete_credential() {
                Err(keyring::Error::NoEntry) => Ok(()),
                result => result,
            },
        };
        result.map_err(|_| "CLOUD_SESSION_STORAGE_UNAVAILABLE".into())
    })
    .await
    .map_err(|_| "CLOUD_SESSION_STORAGE_UNAVAILABLE")?;

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (origin, token);
        Err("CLOUD_SESSION_STORAGE_UNAVAILABLE".into())
    }
}

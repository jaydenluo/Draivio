use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonResponse {
    pub status: u16,
    pub body: serde_json::Value,
    pub retry_after: u64,
}

pub fn client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|_| "无法创建网络请求".into())
}

pub fn retry_after(header: Option<&str>, now: std::time::SystemTime) -> u64 {
    let milliseconds = header
        .and_then(|value| {
            value
                .parse::<u64>()
                .ok()
                .map(|seconds| seconds.saturating_mul(1000))
                .or_else(|| {
                    httpdate::parse_http_date(value).ok().map(|date| {
                        date.duration_since(now)
                            .unwrap_or_default()
                            .as_millis()
                            .min(60000) as u64
                    })
                })
        })
        .unwrap_or(1000);
    milliseconds.clamp(1000, 60000)
}

/** One attempt only: callers decide whether a potentially paid request can be retried. */
pub async fn send_json(request: reqwest::RequestBuilder) -> Result<JsonResponse, String> {
    let response = request.send().await.map_err(|error| {
        if error.is_timeout() {
            "请求超时，请稍后重试"
        } else {
            "网络连接失败，请检查网络或代理设置"
        }
    })?;
    let status = response.status().as_u16();
    let retry_after = retry_after(
        response
            .headers()
            .get("retry-after")
            .and_then(|value| value.to_str().ok()),
        std::time::SystemTime::now(),
    );
    // Supplier error bodies can echo credentials or prompt data.
    const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
    let body = if response.status().is_success() {
        if response
            .content_length()
            .map(|size| size as usize > MAX_RESPONSE_BYTES)
            .unwrap_or(false)
        {
            return Err("供应商响应过大".into());
        }
        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| "响应中断或格式无效")?;
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err("供应商响应过大".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| "响应中断或格式无效")?
    } else {
        serde_json::Value::Null
    };
    Ok(JsonResponse {
        status,
        body,
        retry_after,
    })
}

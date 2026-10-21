mod edt;

use axum::{
    Json,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use tokio::net::TcpListener;

use edt::{CachedPayload, ErrorCode};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let app = axum::Router::new().route("/api/timetable", get(timetable_endpoint));

    let address = "0.0.0.0:8000";
    let listener = TcpListener::bind(address)
        .await
        .expect("failed to bind the listen address");

    tracing::info!("listening on {address}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server crashed");
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

fn failure(status: StatusCode, code: &str, message: &str) -> Response {
    tracing::error!("[{code}] {message}");
    (
        status,
        Json(json!({ "success": false, "code": code, "message": message })),
    )
        .into_response()
}

fn etag_matches(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value.split(',').any(|candidate| {
                candidate.trim().trim_start_matches("W/").trim_matches('"') == etag
            })
        })
}

/// respond with the pre-serialized payload, or 304 when the client already
/// holds this exact version.
fn success(headers: &HeaderMap, payload: &CachedPayload) -> Response {
    let base_headers = [
        (header::ETAG, format!("\"{}\"", payload.etag)),
        (header::CACHE_CONTROL, "public, no-cache".to_owned()),
    ];

    if etag_matches(headers, &payload.etag) {
        return (StatusCode::NOT_MODIFIED, base_headers).into_response();
    }

    (
        StatusCode::OK,
        base_headers,
        [(header::CONTENT_TYPE, "application/json")],
        format!("{{\"success\":true,\"data\":{}}}", payload.body),
    )
        .into_response()
}

async fn timetable_endpoint(headers: HeaderMap) -> Response {
    let username = headers
        .get("x-username")
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned)
        .unwrap_or_default();

    let password = headers
        .get("x-password")
        .and_then(|v| v.to_str().ok())
        .map(ToOwned::to_owned)
        .unwrap_or_default();

    if username.is_empty() || password.is_empty() {
        return failure(
            StatusCode::BAD_REQUEST,
            "MISSING_CREDENTIALS",
            "Username and password are required headers (x-username, x-password).",
        );
    }

    match edt::get_user_timetable(&username, &password).await {
        Ok(payload) => success(&headers, &payload),
        Err(error) => {
            let status = match error.code() {
                ErrorCode::InvalidCredentials => StatusCode::UNAUTHORIZED,
                ErrorCode::Upstream => StatusCode::BAD_GATEWAY,
            };

            failure(status, error.code().as_str(), &error.to_string())
        }
    }
}

mod cache;
mod edt;

use axum::{
    Json,
    extract::State,
    http::{HeaderMap, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};

use cache::Cache;
use edt::CachedPayload;

#[derive(Clone)]
struct AppState {
    cache: Cache,
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let state = AppState {
        cache: Cache::new(),
    };

    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::IF_NONE_MATCH,
            header::HeaderName::from_static("x-username"),
            header::HeaderName::from_static("x-password"),
        ])
        .allow_origin(Any);

    let app = axum::Router::new()
        .route("/api/timetable", get(timetable_endpoint))
        .layer(cors)
        .with_state(state);

    let address = env_or("LISTEN_ADDRESS", "0.0.0.0:8000");
    let listener = tokio::net::TcpListener::bind(&address)
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

fn failure(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(json!({ "success": false, "message": message })),
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

async fn timetable_endpoint(State(state): State<AppState>, headers: HeaderMap) -> Response {
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
            "Username and password are required headers (x-username, x-password).",
        );
    }

    match edt::get_user_timetable(&state.cache, &username, &password).await {
        Ok(payload) => success(&headers, &payload),
        Err(error) => failure(
            StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Server error: {error}"),
        ),
    }
}

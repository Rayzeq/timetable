mod cache;
mod edt;
mod openapi;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};
use utoipa::OpenApi;
use utoipa_scalar::{Scalar, Servable};

use crate::cache::Cache;
use crate::edt::{CachedPayload, EdtError};

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

    let cache_url = env_or("CACHE_URL", "redis://127.0.0.1:6379");
    let state = AppState {
        cache: Cache::connect(&cache_url).await,
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

    let openapi_spec = openapi::ApiDoc::openapi();
    let openapi_json = openapi_spec
        .to_json()
        .expect("failed to serialize the openapi spec");

    let app = axum::Router::new()
        .route("/api/health", get(health))
        .route("/api/timetable", get(timetable_endpoint))
        .merge(Scalar::with_url("/api/openapi", openapi_spec))
        .route(
            "/api/openapi.json",
            get(move || {
                let body = openapi_json.clone();
                async move { ([(header::CONTENT_TYPE, "application/json")], body).into_response() }
            }),
        )
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

fn edt_failure(error: EdtError) -> Response {
    match error {
        EdtError::NotFound => failure(StatusCode::NOT_FOUND, "Timetable not found"),
        EdtError::Upstream(message) => {
            tracing::error!("upstream failure: {message}");
            failure(
                StatusCode::BAD_GATEWAY,
                &format!(
                    "The timetable server could not be reached or authentication failed: {message}"
                ),
            )
        }
    }
}

/// health probe.
#[utoipa::path(get, path = "/api/health", tag = "Meta",
    responses(
        (status = 200, description = "the service is up", body = openapi::HealthResponse),
    ))]
async fn health() -> Response {
    Json(json!({ "success": true })).into_response()
}

/// user timetable endpoint.
#[utoipa::path(get, path = "/api/timetable", tag = "Timetable",
    responses(
        (status = 200, description = "user timetable events",
            body = openapi::TimetableResponse,
            headers(
                ("ETag" = String, description = "fingerprint of the payload"),
                ("Cache-Control" = String, description = "`public, no-cache`, always revalidate"),
            )),
        (status = 400, description = "invalid credentials", body = openapi::ErrorResponse),
        (status = 502, description = "the timetable server could not be reached", body = openapi::ErrorResponse),
    ))]
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
        Err(error) => edt_failure(error),
    }
}

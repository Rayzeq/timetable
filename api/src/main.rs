mod cache;
mod edt;
mod openapi;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use serde_json::json;
use tower_http::cors::{Any, CorsLayer};
use utoipa::OpenApi;
use utoipa_scalar::{Scalar, Servable};

use crate::cache::Cache;
use crate::edt::{CachedPayload, EdtError, Year};

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
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let cache_url = env_or("CACHE_URL", "redis://127.0.0.1:6379");
    let state = AppState {
        cache: Cache::connect(&cache_url).await,
    };

    // background refresher: keeps listings, parsed files and serialized
    // responses warm so requests are pure cache hits and upstream updates
    // land within one interval. 0 disables it.
    let refresh_seconds = env_or("REFRESH_INTERVAL_SECONDS", "120")
        .parse::<u64>()
        .unwrap_or(120);
    if refresh_seconds > 0 {
        let cache = state.cache.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(refresh_seconds));
            loop {
                interval.tick().await;
                edt::refresh_all(&cache).await;
            }
        });
    }

    let cors = CorsLayer::new()
        .allow_methods([Method::GET, Method::OPTIONS])
        .allow_origin(Any);

    let openapi_spec = openapi::ApiDoc::openapi();
    let openapi_json = openapi_spec
        .to_json()
        .expect("failed to serialize the openapi spec");

    let app = axum::Router::new()
        .route("/api/health", get(health))
        .route("/api/timetables/{year}", get(timetables_meta))
        .route("/api/timetable/{year}/{week}", get(timetable_week))
        .merge(Scalar::with_url("/api/openapi", openapi_spec))
        .route("/api/openapi.json", get(move || {
            let body = openapi_json.clone();
            async move {
                ([(header::CONTENT_TYPE, "application/json")], body).into_response()
            }
        }))
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
    (status, Json(json!({ "success": false, "message": message }))).into_response()
}

/// nginx downgrades the etag to weak when compressing, so incoming
/// validators are compared with the weak marker stripped.
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
        EdtError::NotFound => failure(
            StatusCode::NOT_FOUND,
            "Timetable not found, are you sure this week has been published?",
        ),
        EdtError::Upstream(message) => {
            tracing::error!("upstream failure: {message}");
            failure(
                StatusCode::BAD_GATEWAY,
                "The timetable server could not be reached, please try again later.",
            )
        }
    }
}

/// health probe.
#[utoipa::path(get, path = "/api/health", tag = "meta",
    responses(
        (status = 200, description = "the service is up", body = openapi::HealthResponse),
    ))]
async fn health() -> Response {
    Json(json!({ "success": true })).into_response()
}

/// header metadata of every published week for a study year.
#[utoipa::path(get, path = "/api/timetables/{year}", tag = "timetables",
    params(
        ("year" = String, Path, description = "study year - `A1`, `A2` or `A3`", example = "A1"),
    ),
    responses(
        (status = 200, description = "known weeks, sorted by week number",
            body = openapi::TimetablesMetaResponse,
            headers(
                ("ETag" = String, description = "fingerprint of the source files"),
                ("Cache-Control" = String, description = "`public, no-cache` - always revalidate"),
            )),
        (status = 304, description = "the version matching `If-None-Match` is still current"),
        (status = 400, description = "invalid year", body = openapi::ErrorResponse),
        (status = 502, description = "the timetable server could not be reached", body = openapi::ErrorResponse),
    ))]
async fn timetables_meta(
    State(state): State<AppState>,
    Path(year): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(year) = Year::parse(&year) else {
        return failure(StatusCode::BAD_REQUEST, "Year must be one of A1, A2, A3.");
    };

    match edt::get_year_meta(&state.cache, year).await {
        Ok(payload) => success(&headers, &payload),
        Err(error) => edt_failure(error),
    }
}

/// timetable of one week, merged from every group of the study year.
#[utoipa::path(get, path = "/api/timetable/{year}/{week}", tag = "timetables",
    params(
        ("year" = String, Path, description = "study year - `A1`, `A2` or `A3`", example = "A1"),
        ("week" = i64, Path, description = "week number in the published files, `1` to `52`", example = 1),
    ),
    responses(
        (status = 200, description = "merged timetable of the week",
            body = openapi::TimetableResponse,
            headers(
                ("ETag" = String, description = "fingerprint of the source files"),
                ("Cache-Control" = String, description = "`public, no-cache` - always revalidate"),
            )),
        (status = 304, description = "the version matching `If-None-Match` is still current"),
        (status = 400, description = "invalid year or week", body = openapi::ErrorResponse),
        (status = 404, description = "the week is not published", body = openapi::ErrorResponse),
        (status = 502, description = "the timetable server could not be reached", body = openapi::ErrorResponse),
    ))]
async fn timetable_week(
    State(state): State<AppState>,
    Path((year, week)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    let Some(year) = Year::parse(&year) else {
        return failure(StatusCode::BAD_REQUEST, "Year must be one of A1, A2, A3.");
    };
    let Ok(week) = week.parse::<i64>() else {
        return failure(StatusCode::BAD_REQUEST, "Week must be a number.");
    };
    if !(1..=52).contains(&week) {
        return failure(StatusCode::BAD_REQUEST, "Week must be between 1 and 52.");
    }

    match edt::get_year_week_timetable(&state.cache, year, week).await {
        Ok(payload) => success(&headers, &payload),
        Err(error) => edt_failure(error),
    }
}

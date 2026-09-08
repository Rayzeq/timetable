use core::fmt;
use std::{collections::HashMap, sync::Arc, time::Duration};

use reqwest::{Client, redirect::Policy};
use serde::{Deserialize, Serialize};

use crate::cache::Cache;

const CACHE_TTL: Duration = Duration::from_mins(15);

#[derive(Debug, Clone, Deserialize)]
struct UpstreamEventsResponse {
    results: Vec<Event>,
}

#[derive(Debug, Clone, Serialize)]
struct EventsResponse {
    name: String,
    events: Vec<Event>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Event {
    start: String,
    end: String,
    title: String,
    r#type: String,
}

pub struct CachedPayload {
    pub etag: String,
    pub body: Arc<str>,
}

#[derive(Debug)]
pub struct Error(String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

async fn fetch_events(
    username: &str,
    password: &str,
) -> Result<(String, UpstreamEventsResponse), Error> {
    let client = Client::builder()
        .redirect(Policy::none())
        .cookie_store(true)
        .build()
        .map_err(|e| Error(e.to_string()))?;

    let login_url =
        "https://cas.univ-avignon.fr/cas/login?service=https://edt.univ-avignon.fr/login";
    let resp = client
        .get(login_url)
        .header("Referer", "https://edt.univ-avignon.fr/")
        .header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0",
        )
        .send()
        .await
        .map_err(|e| Error(e.to_string()))?;

    let html = resp.text().await.map_err(|e| Error(e.to_string()))?;

    let execution = {
        let document = scraper::Html::parse_document(&html);
        let selector = scraper::Selector::parse("input[name='execution']")
            .map_err(|e| Error(e.to_string()))?;
        document
            .select(&selector)
            .next()
            .ok_or_else(|| Error("Execution token not found in CAS page".to_string()))?
            .value()
            .attr("value")
            .ok_or_else(|| Error("Execution input has no value".to_string()))?
            .to_owned()
    };

    let mut params = HashMap::new();
    params.insert("username", username);
    params.insert("password", password);
    params.insert("execution", &execution);
    params.insert("_eventId", "submit");
    params.insert("geolocation", "");

    let post_resp = client
        .post(login_url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Origin", "https://cas.univ-avignon.fr")
        .header("Referer", login_url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0",
        )
        .form(&params)
        .send()
        .await
        .map_err(|e| Error(e.to_string()))?;

    let location = post_resp
        .headers()
        .get(reqwest::header::LOCATION)
        .ok_or_else(|| {
            Error("CAS login failed: missing redirect location (check credentials?)".to_string())
        })?
        .to_str()
        .map_err(|e| Error(e.to_string()))?
        .to_owned();

    let _ = client
        .get(&location)
        .header("Referer", "https://cas.univ-avignon.fr/")
        .header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0",
        )
        .send()
        .await;

    let ticket = location
        .split("ticket=")
        .nth(1)
        .ok_or_else(|| Error("Ticket not found in redirect location".to_string()))?;

    let auth_url = "https://edt-api.univ-avignon.fr/api/auth/login";
    let auth_payload = serde_json::json!({
        "service": "https://edt.univ-avignon.fr",
        "ticket": ticket,
        "version": ""
    });

    let auth_resp = client
        .post(auth_url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Origin", "https://edt.univ-avignon.fr")
        .header("Referer", "https://edt.univ-avignon.fr/")
        .header("token", "undefined")
        .header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0",
        )
        .json(&auth_payload)
        .send()
        .await
        .map_err(|e| Error(e.to_string()))?;

    let auth_json: serde_json::Value = auth_resp.json().await.map_err(|e| Error(e.to_string()))?;
    let token = auth_json
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| Error("Token not found in EDT auth response".to_string()))?;
    let full_name = auth_json
        .get("user")
        .and_then(|v| v.as_object())
        .and_then(|v| v.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Nom Indisponible");

    let events_url = "https://edt-api.univ-avignon.fr/api/events_perso?autre=false";
    let events_resp = client
        .get(events_url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Origin", "https://edt.univ-avignon.fr")
        .header("Referer", "https://edt.univ-avignon.fr/")
        .header("token", token)
        .header(
            "User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64; rv:152.0) Gecko/20100101 Firefox/152.0",
        )
        .send()
        .await
        .map_err(|e| Error(e.to_string()))?;

    let events: UpstreamEventsResponse =
        events_resp.json().await.map_err(|e| Error(e.to_string()))?;

    Ok((full_name.to_owned(), events))
}

pub async fn get_user_timetable(
    cache: &Cache,
    username: &str,
    password: &str,
) -> Result<CachedPayload, Error> {
    let cache_key = format!("edt:user:{username}");
    if let Some(body) = cache.get(&cache_key).await {
        let etag = compute_etag(&body);
        return Ok(CachedPayload { etag, body });
    }

    let (name, events) = fetch_events(username, password).await?;
    let body_str = serde_json::to_string(&EventsResponse {
        name,
        events: events.results,
    })
    .map_err(|e| Error(e.to_string()))?;
    let body: Arc<str> = Arc::from(body_str);
    let etag = compute_etag(&body);

    cache.set(&cache_key, &body, CACHE_TTL).await;

    Ok(CachedPayload { etag, body })
}

fn compute_etag(content: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in content.bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

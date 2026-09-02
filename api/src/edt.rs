use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::sync::Arc;

use chrono::DateTime;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use unilim_edt_iut_info::{OnlineTimetable, OnlineTimetableFileEntry, SUBGROUPS, Timetable};

use crate::cache::Cache;

const LISTING_TTL_SECONDS: u64 = 300;
const TIMETABLE_TTL_SECONDS: u64 = 60 * 60 * 24 * 30;
const RESPONSE_TTL_SECONDS: u64 = 60 * 60 * 24 * 7;
const FETCH_CONCURRENCY: usize = 6;

pub const YEARS: [Year; 3] = [Year::A1, Year::A2, Year::A3];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Year {
    A1,
    A2,
    A3,
}

impl Year {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "A1" => Some(Self::A1),
            "A2" => Some(Self::A2),
            "A3" => Some(Self::A3),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::A1 => "A1",
            Self::A2 => "A2",
            Self::A3 => "A3",
        }
    }

    pub fn main_groups(self) -> &'static [u8] {
        match self {
            Self::A1 => &[1, 2, 3],
            Self::A2 => &[4, 5],
            Self::A3 => &[7, 8],
        }
    }

    fn subgroup_pairs(self) -> Vec<(u8, u8)> {
        self.main_groups()
            .iter()
            .flat_map(|&main| [(main, 0u8), (main, 1u8)])
            .collect()
    }
}

/// one ics file from a subgroup directory listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListingEntry {
    pub file_name: String,
    /// iso 8601 last-update timestamp from the listing.
    pub last_updated: String,
    pub week_number: i64,
}

/// timetable of a week, merged from every subgroup file of a year.
#[derive(Serialize)]
struct MergedTimetable {
    #[serde(flatten)]
    timetable: Timetable,
    last_update: String,
}

/// header metadata of a published week.
#[derive(Serialize)]
struct WeekMeta {
    week_number: i64,
    week_number_in_year: i64,
    start_date: String,
    end_date: String,
    last_update: String,
}

/// a fully serialized response payload with its validator.
pub struct CachedPayload {
    /// fingerprint of the input files, used as http etag.
    pub etag: String,
    /// serialized json of the `data` part of the response envelope.
    pub body: Arc<str>,
}

#[derive(Debug)]
pub enum EdtError {
    NotFound,
    Upstream(String),
}

impl std::fmt::Display for EdtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => write!(f, "timetable not found"),
            Self::Upstream(message) => write!(f, "upstream failure: {message}"),
        }
    }
}

fn subgroup_letter(subgroup: u8) -> char {
    if subgroup == 0 { 'a' } else { 'b' }
}

fn listing_key(main_group: u8, subgroup: u8) -> String {
    format!("edt:listing:G{main_group}{}", subgroup_letter(subgroup))
}

fn fingerprint<'a>(entries: impl IntoIterator<Item = &'a ListingEntry>) -> String {
    let mut parts = entries
        .into_iter()
        .map(|entry| format!("{}|{}", entry.file_name, entry.last_updated))
        .collect::<Vec<_>>();
    parts.sort_unstable();

    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in parts.join("\n").bytes() {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }

    format!("{hash:016x}")
}

async fn fetch_listing_upstream(main_group: u8, subgroup: u8) -> Option<Vec<ListingEntry>> {
    let sub = if subgroup == 0 { SUBGROUPS::A } else { SUBGROUPS::B };
    match OnlineTimetable::get_timetable_entries(main_group, sub).await {
        Ok(entries) => Some(
            entries
                .into_iter()
                .map(|entry| ListingEntry {
                    file_name: entry.file_name(),
                    last_updated: entry.last_updated(),
                    week_number: i64::from(entry.week_number()),
                })
                .collect(),
        ),
        Err(error) => {
            tracing::warn!(
                "listing fetch failed for G{main_group}{}: {error}",
                subgroup_letter(subgroup)
            );
            None
        }
    }
}

/// cached subgroup listing, falling back to upstream on a full miss
async fn get_subgroup_listing(cache: &Cache, main_group: u8, subgroup: u8) -> Vec<ListingEntry> {
    let key = listing_key(main_group, subgroup);
    if let Some(entries) = cache.get_json::<Vec<ListingEntry>>(&key, LISTING_TTL_SECONDS).await {
        return entries;
    }

    let Some(entries) = fetch_listing_upstream(main_group, subgroup).await else {
        // not cached, so the next request retries.
        return Vec::new();
    };

    cache.set_json(&key, &entries, LISTING_TTL_SECONDS).await;
    entries
}

/// every listed file of a year, across all its main groups and subgroups.
async fn get_year_listing(cache: &Cache, year: Year) -> Vec<ListingEntry> {
    futures::stream::iter(year.subgroup_pairs())
        .map(|(main, sub)| get_subgroup_listing(cache, main, sub))
        .buffer_unordered(FETCH_CONCURRENCY)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .flatten()
        .collect()
}

/// fetch and parse one ics file, cached under its last-update timestamp so
/// an upstream republication produces a fresh key.
async fn get_file_timetable(cache: &Cache, entry: &ListingEntry) -> Result<Timetable, EdtError> {
    let key = format!("edt:ics:{}:{}", entry.file_name, entry.last_updated);
    if let Some(timetable) = cache.get_json::<Timetable>(&key, TIMETABLE_TTL_SECONDS).await {
        return Ok(timetable);
    }

    // the listing date only feeds the entry's own last-update field, which we
    // track ourselves, so an empty one is fine here.
    let file_entry = OnlineTimetableFileEntry::new(entry.file_name.clone(), String::new())
        .map_err(|error| EdtError::Upstream(error.to_string()))?;

    let timetable = file_entry
        .get_timetable()
        .await
        .map_err(|error| EdtError::Upstream(error.to_string()))?;

    cache.set_json(&key, &timetable, TIMETABLE_TTL_SECONDS).await;
    Ok(timetable)
}

fn latest_update<'a>(entries: impl IntoIterator<Item = &'a ListingEntry>) -> String {
    entries
        .into_iter()
        .max_by_key(|entry| {
            DateTime::parse_from_rfc3339(&entry.last_updated)
                .map(|date| date.timestamp())
                .unwrap_or(i64::MIN)
        })
        .map(|entry| entry.last_updated.clone())
        .unwrap_or_default()
}

/// merged timetable of a week, served pre-serialized from the response cache.
/// the key embeds the fingerprint of the relevant files, so any upstream
/// update rebuilds it; the fingerprint doubles as the etag.
pub async fn get_year_week_timetable(
    cache: &Cache,
    year: Year,
    week_number: i64,
) -> Result<CachedPayload, EdtError> {
    let listing = get_year_listing(cache, year).await;
    let relevant = listing
        .iter()
        .filter(|entry| entry.week_number == week_number)
        .collect::<Vec<_>>();

    if relevant.is_empty() {
        return Err(EdtError::NotFound);
    }

    let etag = fingerprint(relevant.iter().copied());
    let key = format!("edt:merged:{}:{week_number}:{etag}", year.as_str());
    if let Some(body) = cache.get_raw(&key, RESPONSE_TTL_SECONDS).await {
        return Ok(CachedPayload { etag, body });
    }

    let merged = build_merged_timetable(cache, week_number, &relevant).await?;
    let body = serde_json::to_string(&merged)
        .map_err(|error| EdtError::Upstream(error.to_string()))?;
    cache.set_raw(&key, &body, RESPONSE_TTL_SECONDS).await;

    Ok(CachedPayload { etag, body: Arc::from(body) })
}

/// merge every subgroup file of a week into a single timetable.
async fn build_merged_timetable(
    cache: &Cache,
    week_number: i64,
    relevant: &[&ListingEntry],
) -> Result<MergedTimetable, EdtError> {
    let owned = relevant
        .iter()
        .map(|&entry| entry.clone())
        .collect::<Vec<ListingEntry>>();
    let results = futures::stream::iter(owned)
        .map(|entry| {
            let cache = cache.clone();
            async move { get_file_timetable(&cache, &entry).await }
        })
        .buffer_unordered(FETCH_CONCURRENCY)
        .collect::<Vec<_>>()
        .await;

    let mut timetables = Vec::new();
    for result in results {
        match result {
            Ok(timetable) => timetables.push(timetable),
            Err(error) => tracing::warn!("skipping unfetchable file for week {week_number}: {error}"),
        }
    }

    let Some(first) = timetables.first() else {
        return Err(EdtError::Upstream(
            "none of the week's files could be retrieved".into(),
        ));
    };

    let header = first.header.clone();
    let mut seen = HashSet::new();
    let mut lessons = timetables
        .iter()
        .flat_map(|timetable| timetable.lessons.iter())
        .filter(|&lesson| seen.insert(lesson))
        .cloned()
        .collect::<Vec<_>>();

    lessons.sort_by_cached_key(|lesson| {
        (
            DateTime::parse_from_rfc3339(&lesson.start_date)
                .map(|date| date.timestamp())
                .unwrap_or(i64::MIN),
            lesson.group.as_ref().map(|group| (group.main, group.sub)),
            lesson.content.room.clone(),
        )
    });

    Ok(MergedTimetable {
        timetable: Timetable { header, lessons },
        last_update: latest_update(relevant.iter().copied()),
    })
}

/// header metadata for every published week of a year, served pre-serialized
/// from the response cache under a fingerprint of the whole year listing.
pub async fn get_year_meta(cache: &Cache, year: Year) -> Result<CachedPayload, EdtError> {
    let listing = get_year_listing(cache, year).await;
    if listing.is_empty() {
        return Err(EdtError::Upstream("no published timetable listed".into()));
    }

    let etag = fingerprint(&listing);
    let key = format!("edt:meta:{}:{etag}", year.as_str());
    if let Some(body) = cache.get_raw(&key, RESPONSE_TTL_SECONDS).await {
        return Ok(CachedPayload { etag, body });
    }

    let metas = build_year_meta(cache, listing).await?;
    let body = serde_json::to_string(&metas)
        .map_err(|error| EdtError::Upstream(error.to_string()))?;
    cache.set_raw(&key, &body, RESPONSE_TTL_SECONDS).await;

    Ok(CachedPayload { etag, body: Arc::from(body) })
}

/// headers are identical across the subgroup files of a week, so a single
/// file per week is parsed.
async fn build_year_meta(cache: &Cache, listing: Vec<ListingEntry>) -> Result<Vec<WeekMeta>, EdtError> {
    let mut weeks: BTreeMap<i64, Vec<ListingEntry>> = BTreeMap::new();
    for entry in listing {
        weeks.entry(entry.week_number).or_default().push(entry);
    }

    let mut metas = futures::stream::iter(weeks)
        .map(|(week_number, entries)| {
            let cache = cache.clone();
            async move {
                let last_update = latest_update(&entries);
                for entry in &entries {
                    match get_file_timetable(&cache, entry).await {
                        Ok(timetable) => {
                            return Some(WeekMeta {
                                week_number,
                                week_number_in_year: timetable.header.week_number_in_year,
                                start_date: timetable.header.start_date,
                                end_date: timetable.header.end_date,
                                last_update,
                            });
                        }
                        Err(error) => {
                            tracing::warn!("meta parse failed for week {week_number}: {error}");
                        }
                    }
                }
                None
            }
        })
        .buffer_unordered(FETCH_CONCURRENCY)
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

    if metas.is_empty() {
        return Err(EdtError::Upstream(
            "none of the listed weeks could be retrieved".into(),
        ));
    }

    metas.sort_by_key(|meta| meta.week_number);
    Ok(metas)
}

/// refetch every subgroup listing from upstream, then
/// rebuild whatever responses the new fingerprints invalidated.
pub async fn refresh_all(cache: &Cache) {
    let started = std::time::Instant::now();

    let pairs = YEARS.iter().flat_map(|year| year.subgroup_pairs()).collect::<Vec<_>>();
    futures::stream::iter(pairs)
        .map(|(main, sub)| {
            let cache = cache.clone();
            async move {
                if let Some(entries) = fetch_listing_upstream(main, sub).await {
                    cache.set_json(&listing_key(main, sub), &entries, LISTING_TTL_SECONDS).await;
                }
            }
        })
        .buffer_unordered(FETCH_CONCURRENCY)
        .collect::<Vec<_>>()
        .await;

    for year in YEARS {
        if let Err(error) = get_year_meta(cache, year).await {
            tracing::warn!("refresh: meta rebuild failed for {}: {error}", year.as_str());
        }

        let weeks = get_year_listing(cache, year)
            .await
            .into_iter()
            .map(|entry| entry.week_number)
            .collect::<BTreeSet<_>>();

        for week in weeks {
            if let Err(error) = get_year_week_timetable(cache, year, week).await {
                tracing::warn!(
                    "refresh: merged rebuild failed for {} week {week}: {error}",
                    year.as_str()
                );
            }
        }
    }

    tracing::info!("refresh pass done in {:?}", started.elapsed());
}

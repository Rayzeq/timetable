use redis::{
  Client, AsyncCommands,
  aio::{ ConnectionManager, ConnectionManagerConfig }
};

use serde::Serialize;
use serde::de::DeserializeOwned;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{ Duration, Instant };

use tokio::sync::RwLock;

/// purge expired memory entries once the map grows past this.
const MEMORY_PURGE_THRESHOLD: usize = 4096;

struct MemoryEntry {
    expires_at: Instant,
    value: Arc<str>,
}

#[derive(Clone)]
pub struct Cache {
    memory: Arc<RwLock<HashMap<String, MemoryEntry>>>,
    conn: Option<ConnectionManager>,
}

impl Cache {
    pub async fn connect(url: &str) -> Self {
        let config = ConnectionManagerConfig::new()
            .set_number_of_retries(2)
            .set_factor(2)
            .set_max_delay(2000)
            .set_connection_timeout(Duration::from_secs(2));

        let conn = match Client::open(url) {
            Ok(client) => {
                match client.get_connection_manager_with_config(config).await {
                    Ok(conn) => {
                        tracing::info!("connected to cache database at {url}");
                        Some(conn)
                    }
                    Err(error) => {
                        tracing::warn!(
                            "cache database unreachable, running on memory only: {error}"
                        );
                        None
                    }
                }
            }
            Err(error) => {
                tracing::warn!("invalid cache database url, running on memory only: {error}");
                None
            }
        };

        Self {
            memory: Arc::new(RwLock::new(HashMap::new())),
            conn,
        }
    }

    pub async fn get_raw(&self, key: &str, ttl_seconds: u64) -> Option<Arc<str>> {
        {
            let memory = self.memory.read().await;
            if let Some(entry) = memory.get(key)
                && entry.expires_at > Instant::now() {
                    return Some(entry.value.clone());
                }
        }

        let mut conn = self.conn.clone()?;
        let raw: Option<String> = match conn.get(key).await {
            Ok(value) => value,
            Err(error) => {
                tracing::warn!("cache get failed for {key}: {error}");
                return None;
            }
        };

        let value: Arc<str> = Arc::from(raw?);
        self.set_memory(key.to_owned(), value.clone(), ttl_seconds).await;
        Some(value)
    }

    /// raw string set on both tiers.
    pub async fn set_raw(&self, key: &str, value: &str, ttl_seconds: u64) {
        self.set_memory(key.to_owned(), Arc::from(value), ttl_seconds).await;

        let Some(mut conn) = self.conn.clone() else {
            return;
        };
        if let Err(error) = conn.set_ex::<_, _, ()>(key, value, ttl_seconds).await {
            tracing::warn!("cache set failed for {key}: {error}");
        }
    }

    pub async fn get_json<T: DeserializeOwned>(&self, key: &str, ttl_seconds: u64) -> Option<T> {
        let raw = self.get_raw(key, ttl_seconds).await?;
        serde_json::from_str(&raw).ok()
    }

    pub async fn set_json<T: Serialize>(&self, key: &str, value: &T, ttl_seconds: u64) {
        let Ok(raw) = serde_json::to_string(value) else {
            return;
        };
        self.set_raw(key, &raw, ttl_seconds).await;
    }

    async fn set_memory(&self, key: String, value: Arc<str>, ttl_seconds: u64) {
        let mut memory = self.memory.write().await;

        if memory.len() >= MEMORY_PURGE_THRESHOLD {
            let now = Instant::now();
            memory.retain(|_, entry| entry.expires_at > now);
        }

        memory.insert(key, MemoryEntry {
            expires_at: Instant::now() + Duration::from_secs(ttl_seconds),
            value,
        });
    }
}

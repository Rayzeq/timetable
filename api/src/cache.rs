use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use tokio::sync::RwLock;

/// Purge expired memory entries once the map grows past this.
const PURGE_THRESHOLD: usize = 4096;

struct Entry {
    expires_at: Instant,
    value: Arc<str>,
}

#[derive(Clone)]
pub struct Cache {
    store: Arc<RwLock<HashMap<String, Entry>>>,
}

impl Cache {
    pub fn new() -> Self {
        Self {
            store: Arc::default(),
        }
    }

    pub async fn get(&self, key: &str) -> Option<Arc<str>> {
        {
            let store = self.store.read().await;
            if let Some(entry) = store.get(key)
                && entry.expires_at > Instant::now()
            {
                return Some(Arc::clone(&entry.value));
            }
        }

        None
    }

    pub async fn set(&self, key: &str, value: &str, ttl: Duration) {
        let mut store = self.store.write().await;

        if store.len() >= PURGE_THRESHOLD {
            let now = Instant::now();
            store.retain(|_, entry| entry.expires_at > now);
        }

        store.insert(
            key.to_owned(),
            Entry {
                expires_at: Instant::now() + ttl,
                value: Arc::from(value),
            },
        );
    }
}

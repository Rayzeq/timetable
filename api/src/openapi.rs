//! openapi document served on `/api/openapi` (scalar ui) and
//! `/api/openapi.json` (raw spec).
//!
//! handlers answer with pre-serialized cache entries, so the schemas below
//! exist for documentation only and mirror the wire format by hand.

use utoipa::{OpenApi, ToSchema};

/// kind of a lesson.
#[derive(ToSchema)]
#[schema(rename_all = "UPPERCASE")]
#[allow(dead_code, clippy::upper_case_acronyms)]
pub enum LessonType {
    CM,
    TD,
    TP,
    DS,
    SAE,
    OTHER,
}

/// content of a lesson - fields present depend on the kind.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct LessonContent {
    /// normalized lesson name from the but references, when known.
    #[schema(example = "Initiation au développement")]
    pub lesson_from_reference: Option<String>,
    /// raw lesson name as written in the calendar.
    pub raw_lesson: Option<String>,
    /// free-form description, only on OTHER lessons.
    #[schema(example = "FERIE")]
    pub description: Option<String>,
    #[schema(example = "AC")]
    pub room: String,
    /// teacher initials or name, as written in the calendar.
    #[schema(example = "JP")]
    pub teacher: String,
    /// lesson code.
    #[schema(rename = "type", example = "R1.01")]
    pub kind: Option<String>,
}

/// group assignment of a lesson.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct LessonGroup {
    /// main group, ex.: `1` for G1.
    #[schema(example = 1)]
    pub main: i64,
    /// `0` = subgroup A, `1` = subgroup B - absent when the lesson applies
    /// to the whole main group.
    #[schema(example = 0)]
    pub sub: Option<i64>,
}

/// a single lesson of a merged week timetable.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct TimetableLesson {
    /// iso 8601, europe/paris offset.
    #[schema(example = "2026-09-03T10:00:00.000+02:00")]
    pub start_date: String,
    /// iso 8601, europe/paris offset.
    #[schema(example = "2026-09-03T12:00:00.000+02:00")]
    pub end_date: String,
    #[schema(rename = "type")]
    pub kind: LessonType,
    pub content: LessonContent,
    /// absent on lessons for the whole year - CM and special events.
    pub group: Option<LessonGroup>,
}

/// header of a week timetable.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct TimetableHeader {
    /// monday of the week, iso 8601.
    #[schema(example = "2026-08-31T00:00:00.000+02:00")]
    pub start_date: String,
    /// saturday of the week, iso 8601.
    #[schema(example = "2026-09-05T00:00:00.000+02:00")]
    pub end_date: String,
    /// week number in the published files, ex.: `1` for S1.
    #[schema(example = 1)]
    pub week_number: i64,
    /// iso week number in the year.
    #[schema(example = 36)]
    pub week_number_in_year: i64,
}

/// timetable of a week, merged from every subgroup file of the year.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct Timetable {
    pub header: TimetableHeader,
    pub lessons: Vec<TimetableLesson>,
    /// most recent upstream update among the merged files, iso 8601.
    #[schema(example = "2026-08-28T09:04:00.000+02:00")]
    pub last_update: String,
}

/// header metadata of a published week.
#[derive(ToSchema)]
#[allow(dead_code)]
pub struct WeekMeta {
    #[schema(example = 1)]
    pub week_number: i64,
    #[schema(example = 36)]
    pub week_number_in_year: i64,
    #[schema(example = "2026-08-31T00:00:00.000+02:00")]
    pub start_date: String,
    #[schema(example = "2026-09-05T00:00:00.000+02:00")]
    pub end_date: String,
    #[schema(example = "2026-08-28T09:04:00.000+02:00")]
    pub last_update: String,
}

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct TimetableResponse {
    #[schema(example = true)]
    pub success: bool,
    pub data: Timetable,
}

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct TimetablesMetaResponse {
    #[schema(example = true)]
    pub success: bool,
    pub data: Vec<WeekMeta>,
}

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct HealthResponse {
    #[schema(example = true)]
    pub success: bool,
}

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct ErrorResponse {
    #[schema(example = false)]
    pub success: bool,
    #[schema(example = "Timetable not found, are you sure this week has been published?")]
    pub message: String,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "unilim-timetable-api",
        description = "Timetables of the IUT informatique de Limoges, merged per study year \
from the official per-subgroup `.ics` files of [edt-iut-info.unilim.fr](https://edt-iut-info.unilim.fr/edt).

Responses carry an `ETag` derived from the source files and \
`Cache-Control: public, no-cache` - revalidate with `If-None-Match` to get a \
cheap `304 Not Modified` unless something actually changed upstream.",
        license(name = "MIT"),
        contact(name = "Mikkel ALMONTE--RINGAUD", email = "contact@vexcited.com"),
    ),
    paths(crate::health, crate::timetables_meta, crate::timetable_week),
    components(schemas(
        LessonType,
        LessonContent,
        LessonGroup,
        TimetableLesson,
        TimetableHeader,
        Timetable,
        WeekMeta,
        TimetableResponse,
        TimetablesMetaResponse,
        HealthResponse,
        ErrorResponse,
    )),
    tags(
        (name = "timetables", description = "Merged timetables and their metadata."),
        (name = "meta", description = "Service endpoints."),
    )
)]
pub struct ApiDoc;

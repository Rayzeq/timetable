use utoipa::{OpenApi, ToSchema};

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct EventEntry {
    #[schema(example = "2026-11-03T07:30:00+00:00")]
    pub start: String,
    #[schema(example = "2026-11-03T10:30:00+00:00")]
    pub end: String,
    #[schema(
        example = "Matière : UCE TECHNIQUES DE TEST\nEnseignant : BONNEFOY Ludovic\nType : TP\n"
    )]
    pub title: String,
    #[schema(example = "TP")]
    pub r#type: String,
}

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct EventsResponse {
    pub name: String,
    pub events: Vec<EventEntry>,
}

#[derive(ToSchema)]
#[allow(dead_code)]
pub struct TimetableResponse {
    #[schema(example = true)]
    pub success: bool,
    pub data: EventsResponse,
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
    #[schema(example = "Password is required")]
    pub message: String,
}

#[derive(OpenApi)]
#[openapi(
    info(
        title = "timetable.unilim.vexcited.com",
        description = "Personal timetable API.",
        license(name = "MIT"),
        contact(name = "Mikkel ALMONTE--RINGAUD", email = "contact@vexcited.com"),
    ),
    paths(crate::health, crate::timetable_endpoint),
    components(schemas(
        EventEntry,
        EventsResponse,
        TimetableResponse,
        HealthResponse,
        ErrorResponse,
    )),
    tags(
        (name = "Timetable", description = "User timetable."),
        (name = "Meta", description = "Service endpoints."),
    )
)]
pub struct ApiDoc;

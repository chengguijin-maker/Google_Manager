use crate::database::{self, AccountInput, Database};
use actix_cors::Cors;
use actix_web::{http::header, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: T,
    pub message: String,
}

fn success_response<T: Serialize>(data: T, message: &str) -> HttpResponse {
    HttpResponse::Ok().json(ApiResponse {
        success: true,
        data,
        message: message.to_string(),
    })
}

fn err_response(e: impl ToString) -> HttpResponse {
    HttpResponse::InternalServerError().body(e.to_string())
}

fn unauthorized_response(message: &str) -> HttpResponse {
    HttpResponse::Unauthorized().body(message.to_string())
}

fn bearer_token(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_string())
}

fn ensure_authorized(req: &HttpRequest) -> Result<(), HttpResponse> {
    let token = bearer_token(req);
    crate::auth::require_auth(token.as_deref()).map_err(|e| unauthorized_response(&e))
}

#[derive(Deserialize)]
pub struct GetAccountsQuery {
    pub search: Option<String>,
    pub sold_status: Option<String>,
}

#[derive(Deserialize)]
pub struct BatchImportRequest {
    pub accounts: Vec<AccountInput>,
}

#[derive(Deserialize)]
pub struct TotpRequest {
    pub secret: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Deserialize)]
pub struct CreateBackupRequest {
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct RestoreBackupRequest {
    pub backup_name: String,
}

#[derive(Serialize)]
pub struct BatchImportResponse {
    pub success_count: i32,
    pub failed_count: i32,
}

#[derive(Serialize)]
pub struct TotpResponse {
    pub code: String,
    pub remaining: u32,
}

async fn get_accounts(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    query: web::Query<GetAccountsQuery>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::query_accounts(&conn, query.search.as_deref(), query.sold_status.as_deref()) {
        Ok(list) => success_response(list, "操作成功"),
        Err(e) => err_response(e),
    }
}

async fn create_account(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    account: web::Json<AccountInput>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::create_account(&conn, &account) {
        Ok(acc) => success_response(acc, "账号创建成功"),
        Err(e) => err_response(e),
    }
}

async fn update_account(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
    account: web::Json<AccountInput>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::update_account(&conn, id, &account) {
        Ok(acc) => success_response(acc, "账号更新成功"),
        Err(e) => HttpResponse::NotFound().body(e),
    }
}

async fn delete_account(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::delete_account(&conn, id) {
        Ok(()) => success_response(json!(null), "账号已删除"),
        Err(e) => err_response(e),
    }
}

async fn toggle_status(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::toggle_status(&conn, id) {
        Ok(acc) => success_response(acc, "状态已更新"),
        Err(e) => HttpResponse::NotFound().body(e),
    }
}

async fn toggle_sold_status(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::toggle_sold_status(&conn, id) {
        Ok(acc) => success_response(acc, "出售状态已更新"),
        Err(e) => HttpResponse::NotFound().body(e),
    }
}

async fn batch_import(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    body: web::Json<BatchImportRequest>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::batch_import(&conn, &body.accounts) {
        Ok((success_count, failed_count)) => success_response(
            BatchImportResponse {
                success_count,
                failed_count,
            },
            "批量导入完成",
        ),
        Err(e) => err_response(e),
    }
}

async fn generate_totp(req: HttpRequest, body: web::Json<TotpRequest>) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    match crate::totp::generate_totp(&body.secret) {
        Ok(result) => success_response(
            TotpResponse {
                code: result.code,
                remaining: result.remaining,
            },
            "操作成功",
        ),
        Err(e) => HttpResponse::BadRequest().body(e),
    }
}

async fn get_account_history(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let account_id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::get_account_history(&conn, account_id) {
        Ok(list) => success_response(list, "操作成功"),
        Err(e) => err_response(e),
    }
}

async fn get_account_by_id_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::get_account_by_id(&conn, id) {
        Ok(acc) => success_response(acc, "操作成功"),
        Err(e) => HttpResponse::NotFound().body(e),
    }
}

async fn delete_all_accounts_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::delete_all_accounts(&conn) {
        Ok(count) => success_response(count, "账号已删除"),
        Err(e) => err_response(e),
    }
}

async fn get_deleted_accounts(req: HttpRequest, db: web::Data<Arc<Database>>) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::query_deleted_accounts(&conn) {
        Ok(list) => success_response(list, "操作成功"),
        Err(e) => err_response(e),
    }
}

async fn restore_account_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::restore_account(&conn, id) {
        Ok(acc) => success_response(acc, "账号已恢复"),
        Err(e) => HttpResponse::BadRequest().body(e),
    }
}

async fn purge_account_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    path: web::Path<i64>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let id = path.into_inner();
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::purge_account(&conn, id) {
        Ok(()) => success_response(json!(null), "账号已永久删除"),
        Err(e) => HttpResponse::BadRequest().body(e),
    }
}

async fn purge_all_deleted_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::purge_all_deleted(&conn) {
        Ok(count) => success_response(count, "回收站已清空"),
        Err(e) => err_response(e),
    }
}

async fn create_backup_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    body: web::Json<CreateBackupRequest>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::create_backup(&conn, body.reason.as_deref()) {
        Ok(path) => success_response(path.to_string_lossy().to_string(), "备份创建成功"),
        Err(e) => err_response(e),
    }
}

async fn list_backups_handler(req: HttpRequest) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    match database::list_backups() {
        Ok(list) => success_response(list, "操作成功"),
        Err(e) => err_response(e),
    }
}

async fn restore_backup_handler(
    req: HttpRequest,
    db: web::Data<Arc<Database>>,
    body: web::Json<RestoreBackupRequest>,
) -> impl Responder {
    if let Err(resp) = ensure_authorized(&req) {
        return resp;
    }
    let conn = match db.0.lock() {
        Ok(c) => c,
        Err(e) => return err_response(e),
    };
    match database::restore_backup(&conn, &body.backup_name) {
        Ok(()) => success_response(json!(null), "备份恢复成功"),
        Err(e) => err_response(e),
    }
}

async fn login_handler(body: web::Json<LoginRequest>) -> impl Responder {
    match crate::auth::login(&body.password) {
        Ok(result) => success_response(result, "操作成功"),
        Err(e) => err_response(e),
    }
}

async fn check_auth_handler(req: HttpRequest) -> impl Responder {
    let token = bearer_token(&req);
    match crate::auth::check_auth(token.as_deref()) {
        Ok(result) => success_response(result, "操作成功"),
        Err(e) => err_response(e),
    }
}

async fn logout_handler(req: HttpRequest) -> impl Responder {
    let token = bearer_token(&req);
    match crate::auth::logout(token.as_deref()) {
        Ok(()) => success_response(json!(null), "已退出登录"),
        Err(e) => unauthorized_response(&e),
    }
}

pub async fn start_http_server(db: Arc<Database>, port: u16) -> std::io::Result<()> {
    println!("Starting HTTP server on port {}", port);

    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin("http://localhost:5173")
            .allowed_origin("http://127.0.0.1:5173")
            .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "PATCH"])
            .allowed_headers(vec![
                actix_web::http::header::CONTENT_TYPE,
                actix_web::http::header::AUTHORIZATION,
            ])
            .max_age(3600);
        App::new()
            .wrap(cors)
            .app_data(web::Data::new(db.clone()))
            .route("/api/accounts", web::get().to(get_accounts))
            .route("/api/accounts", web::post().to(create_account))
            .route(
                "/api/accounts/delete-all",
                web::post().to(delete_all_accounts_handler),
            )
            .route("/api/accounts/deleted", web::get().to(get_deleted_accounts))
            .route("/api/accounts/batch-import", web::post().to(batch_import))
            .route(
                "/api/accounts/purge-all",
                web::delete().to(purge_all_deleted_handler),
            )
            .route(
                "/api/accounts/{id}",
                web::get().to(get_account_by_id_handler),
            )
            .route("/api/accounts/{id}", web::put().to(update_account))
            .route("/api/accounts/{id}", web::delete().to(delete_account))
            .route(
                "/api/accounts/{id}/restore",
                web::post().to(restore_account_handler),
            )
            .route(
                "/api/accounts/{id}/purge",
                web::delete().to(purge_account_handler),
            )
            .route("/api/accounts/{id}/status", web::patch().to(toggle_status))
            .route(
                "/api/accounts/{id}/sold",
                web::patch().to(toggle_sold_status),
            )
            .route(
                "/api/accounts/{id}/toggle-status",
                web::post().to(toggle_status),
            )
            .route(
                "/api/accounts/{id}/toggle-sold-status",
                web::post().to(toggle_sold_status),
            )
            .route("/api/totp/generate", web::post().to(generate_totp))
            .route(
                "/api/accounts/{id}/history",
                web::get().to(get_account_history),
            )
            .route("/api/backups", web::post().to(create_backup_handler))
            .route("/api/backups", web::get().to(list_backups_handler))
            .route(
                "/api/backups/restore",
                web::post().to(restore_backup_handler),
            )
            .route("/api/auth/login", web::post().to(login_handler))
            .route("/api/auth/check", web::get().to(check_auth_handler))
            .route("/api/auth/logout", web::post().to(logout_handler))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}

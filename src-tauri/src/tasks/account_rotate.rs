// 定时切换账号后台任务
// 定期自动切换到下一个可用账号

use crate::commands::common::lock_store;
use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::Duration;

/// 账号轮换服务
pub struct AccountRotateService {
    app_handle: AppHandle,
    rotation_count: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

/// 账号轮换统计信息
#[derive(Debug, Clone, serde::Serialize)]
pub struct RotateStats {
    pub total_rotations: u64,
    pub last_rotation_time: Option<String>,
    pub last_account_email: Option<String>,
}

// 全局统计（使用静态变量，跨实例共享）
static ROTATION_STATS: once_cell::sync::Lazy<
    std::sync::Arc<std::sync::Mutex<Vec<RotationRecord>>>,
> = once_cell::sync::Lazy::new(|| std::sync::Arc::new(std::sync::Mutex::new(Vec::new())));

/// 单次轮换记录
#[derive(Debug, Clone, serde::Serialize)]
pub struct RotationRecord {
    pub rotation_number: u64,
    pub timestamp: String,
    pub account_email: String,
    pub account_label: Option<String>,
    pub account_type: String,
    pub total_available: usize,
    pub success: bool,
    // 配额信息
    pub old_account_email: Option<String>,
    pub old_account_used: Option<i32>,
    pub old_account_total: Option<i32>,
    pub old_account_usage_percent: Option<f64>,
    pub new_account_used: Option<i32>,
    pub new_account_total: Option<i32>,
    pub new_account_remaining: Option<i32>,
    pub new_account_usage_percent: Option<f64>,
}

/// 获取轮换统计信息（供前端调用）
#[tauri::command]
pub async fn get_rotation_stats() -> Result<RotateStats, String> {
    let records = ROTATION_STATS
        .lock()
        .map_err(|e| format!("Failed to lock rotation stats: {}", e))?;

    let total = records.len() as u64;
    let last_record = records.last().cloned();

    Ok(RotateStats {
        total_rotations: total,
        last_rotation_time: last_record.as_ref().map(|r| r.timestamp.clone()),
        last_account_email: last_record.map(|r| r.account_email),
    })
}

/// 获取轮换历史记录（供前端调用）
#[tauri::command]
pub async fn get_rotation_history(limit: Option<usize>) -> Result<Vec<RotationRecord>, String> {
    let records = ROTATION_STATS
        .lock()
        .map_err(|e| format!("Failed to lock rotation stats: {}", e))?;

    let limit = limit.unwrap_or(50).min(100); // 最多返回 100 条
    let start_index = if records.len() > limit {
        records.len() - limit
    } else {
        0
    };

    Ok(records[start_index..].to_vec())
}

impl AccountRotateService {
    /// 创建新的账号轮换服务
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            rotation_count: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0)),
        }
    }

    /// 启动后台轮换循环
    pub fn start(self) {
        log::info!("🔄 [账号轮换] 后台任务已启动");
        
        tauri::async_runtime::spawn(async move {
            let mut last_check_time = chrono::Local::now();
            let mut last_rotation_time: Option<std::time::Instant> = None;
            
            loop {
                // 每30秒检查一次配置
                tokio::time::sleep(Duration::from_secs(30)).await;
                
                // 读取配置，获取间隔时间、开关状态和轮换策略
                let (enabled, interval_minutes, _strategy) = match self.get_rotate_config().await {
                    Ok(config) => config,
                    Err(e) => {
                        log::error!("❌ [账号轮换] 读取配置失败: {}", e);
                        continue;
                    }
                };

                // 如果功能未启用，跳过本次检查
                if !enabled {
                    // 只在状态变化时打印日志
                    let now = chrono::Local::now();
                    if (now - last_check_time).num_minutes() >= 5 {
                        log::debug!("⏸️  [账号轮换] 功能未启用，等待中...");
                        last_check_time = now;
                    }
                    // 清除上次轮换时间，以便启用后立即执行
                    last_rotation_time = None;
                    continue;
                }

                // 检查是否应该执行切换
                let should_rotate = if let Some(last_time) = last_rotation_time {
                    let elapsed = last_time.elapsed();
                    let wait_seconds = interval_minutes * 60;
                    elapsed.as_secs() >= wait_seconds
                } else {
                    // 首次启用，立即执行
                    true
                };

                if !should_rotate {
                    continue;
                }

                // 执行账号切换
                let current_count = self.rotation_count.load(std::sync::atomic::Ordering::Relaxed);
                log::info!(
                    "⏰ [账号轮换 #{}] 开始执行 | 间隔: {} 分钟",
                    current_count + 1,
                    interval_minutes
                );

                let start_time = std::time::Instant::now();
                match self.rotate_to_next_account().await {
                    Ok(()) => {
                        let elapsed = start_time.elapsed();
                        log::info!("✅ [账号轮换] 切换完成，耗时: {:?}", elapsed);
                        last_rotation_time = Some(std::time::Instant::now());
                    }
                    Err(e) => {
                        log::error!("❌ [账号轮换] 切换失败: {}", e);
                        // 失败后也更新时间，避免频繁重试
                        last_rotation_time = Some(std::time::Instant::now());
                    }
                }
            }
        });
    }

    /// 获取轮换配置
    async fn get_rotate_config(&self) -> Result<(bool, u64, String), String> {
        let state = self.app_handle.state::<AppState>();
        let settings = state
            .settings
            .lock()
            .map_err(|_| "Failed to acquire settings lock".to_string())?;

        let enabled = settings.auto_rotate_account.unwrap_or(false);
        let interval = settings.auto_rotate_interval.unwrap_or(5);
        let strategy = settings.auto_rotate_strategy.clone().unwrap_or_else(|| "sequential".to_string());

        Ok((enabled, interval, strategy))
    }

    /// 切换到下一个可用账号
    async fn rotate_to_next_account(&self) -> Result<(), String> {
        let rotation_num = self.rotation_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        
        log::info!("🔄 [账号轮换 #{}] 开始执行 | 时间: {}", rotation_num, timestamp);

        // 获取轮换策略
        let (_enabled, _interval, strategy) = self.get_rotate_config().await?;

        // 获取当前登录的账号（如果有）
        let current_account = self.get_current_kiro_account().await;
        
        // 刷新当前账号的配额数据
        if let Some(ref current) = current_account {
            log::info!("📊 [账号轮换] 刷新原账号配额数据...");
            if let Err(e) = self.refresh_account_usage(&current.id).await {
                log::warn!("⚠️  [账号轮换] 刷新原账号配额失败: {}", e);
            }
        }

        // 获取所有可用账号
        let accounts = {
            let state = self.app_handle.state::<AppState>();
            let mut store = lock_store(&state.store, "store")?;
            store.reload();
            store.accounts.clone()
        };

        log::debug!("📊 [账号轮换] 总账号数: {}", accounts.len());

        // 筛选可用账号（启用的、非封禁、非失效、有邮箱）
        let available_accounts: Vec<_> = accounts
            .iter()
            .filter(|acc| {
                acc.enabled
                    && acc.status != "invalid"
                    && acc.status != "banned"
                    && acc.email.is_some()
                    && acc.access_token.is_some()
                    && acc.refresh_token.is_some()
            })
            .collect();

        log::info!(
            "📊 [账号轮换] 可用账号: {} 个 (总数: {} 个)",
            available_accounts.len(),
            accounts.len()
        );

        if available_accounts.is_empty() {
            log::warn!("⚠️  [账号轮换] 没有可用账号，跳过本次轮换");
            log::warn!(
                "   提示: 请检查账号状态 (enabled=true, status≠invalid/banned, 有邮箱, 有 token)"
            );
            return Ok(());
        }

        if available_accounts.len() == 1 {
            let only_account = available_accounts[0];
            let email = only_account.email.as_deref().unwrap_or("未知");
            log::info!(
                "ℹ️  [账号轮换] 只有 1 个可用账号 ({}), 跳过轮换",
                email
            );
            return Ok(());
        }

        // 获取当前登录的账号在列表中的索引
        let current_index = if let Some(ref current) = current_account {
            available_accounts.iter().position(|acc| acc.id == current.id)
        } else {
            None
        };

        // 根据策略选择下一个账号
        let next_index = if strategy == "random" {
            // 随机策略
            use rand::Rng;
            let mut rng = rand::thread_rng();
            rng.gen_range(0..available_accounts.len())
        } else {
            // 顺序策略（默认）
            match current_index {
                Some(idx) => {
                    // 找到当前账号，选择下一个
                    (idx + 1) % available_accounts.len()
                }
                None => {
                    // 当前账号不在可用列表中，或首次运行，从第一个开始
                    0
                }
            }
        };
        
        let next_account = available_accounts[next_index];
        
        let next_email = next_account
            .email
            .as_ref()
            .ok_or("Next account has no email")?;

        let label = &next_account.label;
        let status = &next_account.status;
        let provider = next_account.provider.as_deref().unwrap_or("未知");

        // 记录原账号使用量
        let old_usage_info = if let Some(ref current) = current_account {
            let current_email = current.email.as_deref().unwrap_or("未知");
            let current_usage = self.get_account_usage_info(&current.id).await;
            
            log::info!("📤 [账号轮换] 原账号信息:");
            log::info!("   • 邮箱: {}", current_email);
            if let Some(ref usage) = current_usage {
                log::info!("   • 已用配额: {} / {}", usage.used, usage.total);
                log::info!("   • 使用率: {:.1}%", usage.usage_percent);
            }
            
            current_usage.map(|u| (current_email.to_string(), u))
        } else {
            None
        };

        let strategy_label = if strategy == "random" { "随机" } else { "顺序" };
        log::info!("🎯 [账号轮换] 新账号信息:");
        log::info!("   • 邮箱: {}", next_email);
        log::info!("   • 备注: {}", label);
        log::info!("   • 提供商: {}", provider);
        log::info!("   • 状态: {}", status);
        log::info!("   • 索引: {} / {} ({}轮换)", next_index + 1, available_accounts.len(), strategy_label);

        // 构建切换参数
        let params = crate::kiro::ide::SwitchAccountParams {
            access_token: next_account.access_token.clone().unwrap_or_default(),
            refresh_token: next_account.refresh_token.clone().unwrap_or_default(),
            provider: next_account.provider.clone().unwrap_or_else(|| "Google".to_string()),
            auth_method: next_account.auth_method.clone(),
            profile_arn: next_account.profile_arn.clone(),
            start_url: next_account.start_url.clone(),
            client_id_hash: next_account.client_id_hash.clone(),
            client_id: next_account.client_id.clone(),
            client_secret: next_account.client_secret.clone(),
            region: next_account.region.clone(),
            email: next_account.email.clone(),
        };

        // 执行切换
        log::info!("🔄 [账号轮换] 正在切换账号...");
        match crate::kiro::ide::switch_kiro_account(params).await {
            Ok(result) => {
                if result.success {
                    log::info!("✅ [账号轮换] 切换成功: {}", result.message);
                    
                    // 刷新新账号的配额数据
                    log::info!("📊 [账号轮换] 刷新新账号配额数据...");
                    if let Err(e) = self.refresh_account_usage(&next_account.id).await {
                        log::warn!("⚠️  [账号轮换] 刷新新账号配额失败: {}", e);
                    }
                    
                    // 获取新账号的使用量信息
                    let new_usage = self.get_account_usage_info(&next_account.id).await;
                    if let Some(ref usage) = new_usage {
                        log::info!("📥 [账号轮换] 新账号配额:");
                        log::info!("   • 已用配额: {} / {}", usage.used, usage.total);
                        log::info!("   • 使用率: {:.1}%", usage.usage_percent);
                        log::info!("   • 剩余配额: {}", usage.remaining);
                    }
                    
                    // 记录到历史（包含配额信息）
                    let record = RotationRecord {
                        rotation_number: rotation_num,
                        timestamp: timestamp.clone(),
                        account_email: next_email.clone(),
                        account_label: Some(label.clone()),
                        account_type: provider.to_string(),
                        total_available: available_accounts.len(),
                        success: true,
                        // 原账号配额
                        old_account_email: old_usage_info.as_ref().map(|(email, _)| email.clone()),
                        old_account_used: old_usage_info.as_ref().map(|(_, u)| u.used),
                        old_account_total: old_usage_info.as_ref().map(|(_, u)| u.total),
                        old_account_usage_percent: old_usage_info.as_ref().map(|(_, u)| u.usage_percent),
                        // 新账号配额
                        new_account_used: new_usage.as_ref().map(|u| u.used),
                        new_account_total: new_usage.as_ref().map(|u| u.total),
                        new_account_remaining: new_usage.as_ref().map(|u| u.remaining),
                        new_account_usage_percent: new_usage.as_ref().map(|u| u.usage_percent),
                    };

                    if let Ok(mut stats) = ROTATION_STATS.lock() {
                        stats.push(record);
                        // 只保留最近 100 条记录
                        let len = stats.len();
                        if len > 100 {
                            stats.drain(0..len - 100);
                        }
                    }

                    // 发送事件到前端通知 UI 更新
                    let _ = self.app_handle.emit("auto-rotate-account", next_account.id.clone());
                    log::info!("─────────────────────────────────────");
                    
                    Ok(())
                } else {
                    let err_msg = format!("切换失败: {}", result.message);
                    log::error!("❌ [账号轮换] {}", err_msg);
                    Err(err_msg)
                }
            }
            Err(e) => {
                let err_msg = format!("切换失败: {}", e);
                log::error!("❌ [账号轮换] {}", err_msg);
                Err(err_msg)
            }
        }
    }

    /// 获取当前 Kiro IDE 登录的账号
    async fn get_current_kiro_account(&self) -> Option<crate::core::account::Account> {
        // 读取 Kiro IDE 的 token 文件
        let token = crate::kiro::ide::get_kiro_local_token().await?;
        let refresh_token = token.refresh_token?;
        
        // 在账号列表中查找匹配的账号
        let state = self.app_handle.state::<AppState>();
        let store = lock_store(&state.store, "store").ok()?;
        
        // 根据 refresh_token 匹配账号
        store.accounts.iter()
            .find(|acc| {
                acc.refresh_token.as_deref() == Some(&refresh_token)
            })
            .cloned()
    }

    /// 刷新账号的配额数据
    async fn refresh_account_usage(&self, account_id: &str) -> Result<(), String> {
        use crate::commands::common::{
            ensure_account_machine_id, find_account_by_id, 
            get_usage_by_account, lock_store, save_store
        };
        
        // 获取账号信息
        let state = self.app_handle.state::<AppState>();
        let mut account = find_account_by_id(&state, account_id)?;
        
        // 确保有 machine_id
        if account.machine_id.as_ref().is_none_or(|id| id.trim().is_empty()) {
            ensure_account_machine_id(&mut account);
        }
        
        let access_token = account.access_token.clone().ok_or("No access token")?;
        
        // 获取配额数据
        match get_usage_by_account(&account, &access_token).await {
            Ok(usage_result) => {
                // 更新账号的 usage_data
                let mut store = lock_store(&state.store, "store")?;
                if let Some(a) = store.accounts.iter_mut().find(|a| a.id == account_id) {
                    a.usage_data = Some(usage_result.usage_data);
                    
                    // 提取并更新 email 和 user_id
                    if let Some(user_info) = a.usage_data.as_ref().and_then(|d| d.get("userInfo")) {
                        if let Some(email) = user_info.get("email").and_then(|v| v.as_str()) {
                            if !email.is_empty() {
                                a.email = Some(email.to_string());
                            }
                        }
                        if let Some(user_id) = user_info.get("userId").and_then(|v| v.as_str()) {
                            a.user_id = Some(user_id.to_string());
                        }
                    }
                }
                save_store(&store)?;
                Ok(())
            }
            Err(e) => Err(format!("刷新配额失败: {}", e))
        }
    }

    /// 获取账号的使用量信息
    async fn get_account_usage_info(&self, account_id: &str) -> Option<UsageInfo> {
        let state = self.app_handle.state::<AppState>();
        let store = lock_store(&state.store, "store").ok()?;
        
        let account = store.accounts.iter().find(|acc| acc.id == account_id)?;
        
        // 从 usage_data 中提取配额信息
        let usage_data = account.usage_data.as_ref()?;
        
        // 尝试从 usageBreakdownList[0] 中提取
        if let Some(breakdown) = usage_data.get("usageBreakdownList")
            .and_then(|list| list.as_array())
            .and_then(|arr| arr.first()) {
            
            let used = breakdown.get("currentUsage")
                .and_then(|v| v.as_f64())
                .or_else(|| breakdown.get("currentUsageWithPrecision").and_then(|v| v.as_f64()))
                .unwrap_or(0.0) as i32;
            
            let total = breakdown.get("usageLimit")
                .and_then(|v| v.as_f64())
                .or_else(|| breakdown.get("usageLimitWithPrecision").and_then(|v| v.as_f64()))
                .unwrap_or(0.0) as i32;
            
            let remaining = total - used;
            let usage_percent = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            
            return Some(UsageInfo {
                total,
                used,
                remaining,
                usage_percent,
            });
        }
        
        // 回退方案：尝试 remaining 和 total 字段（旧格式）
        if let (Some(remaining), Some(total)) = (
            usage_data.get("remaining").and_then(|v| v.as_i64()),
            usage_data.get("total").and_then(|v| v.as_i64()),
        ) {
            let total = total as i32;
            let remaining = remaining as i32;
            let used = total - remaining;
            let usage_percent = if total > 0 {
                (used as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            
            return Some(UsageInfo {
                total,
                used,
                remaining,
                usage_percent,
            });
        }
        
        None
    }
}

/// 账号使用量信息
#[derive(Debug, Clone)]
struct UsageInfo {
    pub total: i32,
    pub used: i32,
    pub remaining: i32,
    pub usage_percent: f64,
}

/// 启动账号轮换循环（供 main.rs 调用）
pub fn start_account_rotate_loop(app_handle: AppHandle) {
    log::info!("═══════════════════════════════════════");
    log::info!("🚀 [账号轮换] 初始化后台任务");
    log::info!("   版本: 1.0.0");
    log::info!("   功能: 定时自动切换可用账号");
    log::info!("   配置: 通过设置页面启用/配置");
    log::info!("═══════════════════════════════════════");
    
    let service = AccountRotateService::new(app_handle);
    service.start();
}

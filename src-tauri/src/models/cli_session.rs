use serde::{Deserialize, Serialize};

/// CLI Session 元数据（从 .json 文件解析）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliSessionMeta {
    pub session_id: String,
    pub cwd: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub session_created_reason: Option<String>,
    #[serde(default)]
    pub session_state: Option<CliSessionState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliSessionState {
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub conversation_metadata: Option<CliConversationMetadata>,
    #[serde(default)]
    pub rts_model_state: Option<CliRtsModelState>,
    #[serde(default)]
    pub permissions: Option<serde_json::Value>,
    #[serde(default)]
    pub agent_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConversationMetadata {
    #[serde(default)]
    pub user_turn_metadatas: Vec<CliUserTurnMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliUserTurnMetadata {
    #[serde(default)]
    pub message_ids: Vec<String>,
    #[serde(default)]
    pub total_request_count: u32,
    #[serde(default)]
    pub number_of_cycles: u32,
    #[serde(default)]
    pub builtin_tool_uses: u32,
    #[serde(default)]
    pub turn_duration: Option<CliDuration>,
    #[serde(default)]
    pub end_reason: Option<String>,
    #[serde(default)]
    pub end_timestamp: Option<String>,
    #[serde(default)]
    pub input_token_count: u64,
    #[serde(default)]
    pub output_token_count: u64,
    #[serde(default)]
    pub context_usage_percentage: Option<f64>,
    #[serde(default)]
    pub metering_usage: Vec<CliMeteringUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliDuration {
    #[serde(default)]
    pub secs: u64,
    #[serde(default)]
    pub nanos: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliMeteringUsage {
    #[serde(default)]
    pub value: f64,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(rename = "unitPlural", default)]
    pub unit_plural: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliRtsModelState {
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub model_info: Option<CliModelInfo>,
    #[serde(default)]
    pub context_usage_percentage: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliModelInfo {
    #[serde(default)]
    pub model_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub context_window_tokens: Option<u64>,
    #[serde(default)]
    pub rate_multiplier: Option<f64>,
    #[serde(default)]
    pub rate_unit: Option<String>,
}

/// CLI Session 消息（从 .jsonl 文件解析，每行一条）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliSessionMessage {
    #[serde(default)]
    pub version: Option<String>,
    pub kind: String,
    pub data: CliMessageData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliMessageData {
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub content: Vec<CliContentItem>,
    #[serde(default)]
    pub meta: Option<CliMessageMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliContentItem {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliMessageMeta {
    #[serde(default)]
    pub timestamp: Option<u64>,
}

/// CLI Session 摘要（用于前端列表显示）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliSessionSummary {
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    pub model_name: Option<String>,
    pub agent_name: Option<String>,
    pub message_count: usize,
    pub total_credits: f64,
    pub context_usage: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub file_size: u64,
}

/// CLI Session 完整数据（包含消息）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliSession {
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    pub model_name: Option<String>,
    pub agent_name: Option<String>,
    pub context_usage: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub messages: Vec<CliSessionMessage>,
    pub permissions: Option<serde_json::Value>,
}

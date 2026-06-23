import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Clock, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { useI18n } from '../../../hooks/useI18n'

interface RotationRecord {
  rotation_number: number
  timestamp: string
  account_email: string
  account_label: string | null
  account_type: string
  total_available: number
  success: boolean
  // 配额信息
  old_account_email: string | null
  old_account_used: number | null
  old_account_total: number | null
  old_account_usage_percent: number | null
  new_account_used: number | null
  new_account_total: number | null
  new_account_remaining: number | null
  new_account_usage_percent: number | null
}

interface RotateStats {
  total_rotations: number
  last_rotation_time: string | null
  last_account_email: string | null
}

export default function AccountRotateLog() {
  const { t } = useI18n()
  const [stats, setStats] = useState<RotateStats | null>(null)
  const [history, setHistory] = useState<RotationRecord[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      setLoading(true)
      const [statsData, historyData] = await Promise.all([
        invoke<RotateStats>('get_rotation_stats'),
        invoke<RotationRecord[]>('get_rotation_history', { limit: 20 })
      ])
      setStats(statsData)
      setHistory(historyData.reverse()) // 最新的在前面
    } catch (err) {
      console.error('[账号轮换日志] 加载失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // 每 30 秒自动刷新一次
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin mr-2" size={16} />
        <span className="text-sm text-muted-foreground">加载中...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Clock size={12} />
            <span>总切换次数</span>
          </div>
          <div className="text-2xl font-bold">{stats?.total_rotations || 0}</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <CheckCircle size={12} />
            <span>最后切换时间</span>
          </div>
          <div className="text-sm font-medium">
            {stats?.last_rotation_time || '暂无记录'}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <AlertCircle size={12} />
            <span>当前账号</span>
          </div>
          <div className="text-sm font-medium truncate" title={stats?.last_account_email || ''}>
            {stats?.last_account_email || '暂无记录'}
          </div>
        </div>
      </div>

      {/* 刷新按钮 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">切换历史记录</h3>
        <button
          onClick={loadData}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors"
        >
          <RefreshCw size={12} />
          刷新
        </button>
      </div>

      {/* 历史记录列表 */}
      <div className="rounded-lg border border-border bg-card">
        {history.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            暂无切换记录
          </div>
        ) : (
          <div className="divide-y divide-border">
            {history.map((record, index) => (
              <div
                key={`${record.rotation_number}-${index}`}
                className="p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">
                        #{record.rotation_number}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {record.timestamp}
                      </span>
                    </div>
                    
                    {/* 新账号信息 */}
                    <div className="text-sm font-medium truncate mb-1" title={record.account_email}>
                      {record.account_email}
                    </div>
                    
                    {/* 配额信息 */}
                    {record.new_account_used !== null && record.new_account_total !== null && (
                      <div className="text-xs text-muted-foreground">
                        已用: {record.new_account_used} / {record.new_account_total}
                        {record.new_account_usage_percent !== null && (
                          <span className="ml-2">({record.new_account_usage_percent.toFixed(1)}%)</span>
                        )}
                      </div>
                    )}
                    
                    {record.account_label && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        备注: {record.account_label}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                      {record.account_type}
                    </span>
                    {record.new_account_remaining !== null ? (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        剩余 {record.new_account_remaining}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {record.total_available} 可用
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground text-center">
        显示最近 20 条记录，日志最多保留 100 条
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { Palette, Settings as SettingsIcon, LayoutDashboard, Cpu, Bell, History } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs'
import { useApp } from '../../../hooks/useApp'
import { useDialog } from '../../../contexts/DialogContext'
import { useAppSettings } from '../../../contexts/AppSettingsContext'
import { usePrivacy } from '../../../contexts/PrivacyContext'
import { persistAppSettings, runKiroCommandWithAppSettings, makeAppBoolToggle, makeKiroBoolToggle } from './settingsActions'
import { isValidBrowserPath, isValidProxy } from './settingsValidators'
import SettingsAppearance from './SettingsAppearance'
import SettingsGeneral from './SettingsGeneral'
import SettingsKiro from './SettingsKiro'
import SettingsNotifications from './SettingsNotifications'
import AccountRotateLog from './AccountRotateLog'

function Settings() {
    const { t, theme, setTheme } = useApp()
    const { showConfirm, showError, showSuccess } = useDialog()
    const { updateSettings: updateAppSettings } = useAppSettings()
    const { privacyMode, setPrivacyMode } = usePrivacy()
    const [activeTab, setActiveTab] = useState('general')

    const [aiModel, setAiModel] = useState('claude-sonnet-4.5')
    const [lockModel, setLockModel] = useState(false)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [autoRefreshInterval, setAutoRefreshInterval] = useState(50) // 分钟
    const [httpProxy, setHttpProxy] = useState('')
    const [originalProxy, setOriginalProxy] = useState('') // 原始代理值，用于判断是否修改
    const [appProxyMode, setAppProxyMode] = useState('followKiro')
    const [savingProxy, setSavingProxy] = useState(false)
    const [savingModel, setSavingModel] = useState(false)
    const [browserPath, setBrowserPath] = useState('')
    const [originalBrowserPath, setOriginalBrowserPath] = useState('')
    const [savingBrowser, setSavingBrowser] = useState(false)
    const [detectedBrowsers, setDetectedBrowsers] = useState<any[]>([])
    const [showBrowserList, setShowBrowserList] = useState(false)
    const [customKiroPath, setCustomKiroPath] = useState<string | null>(null)
    const [detectingProxy, setDetectingProxy] = useState(false)
    const [enableCodebaseIndexing, setEnableCodebaseIndexing] = useState(true)
    const [trustedCommandsMode, setTrustedCommandsMode] = useState('none') // 'none' | 'common' | 'all'
    const [customTrustedCommands, setCustomTrustedCommands] = useState('') // 自定义命令列表

    // Agent 设置
    const [agentAutonomy, setAgentAutonomy] = useState('Supervised') // 'Autopilot' | 'Supervised'
    const [enableTabAutocomplete, setEnableTabAutocomplete] = useState(true)
    const [usageSummary, setUsageSummary] = useState(true)
    const [enableDebugLogs, setEnableDebugLogs] = useState(false)

    // 新增 Kiro IDE 设置
    const [trustedTools, setTrustedTools] = useState('')
    const [referenceTracker, setReferenceTracker] = useState(false)
    const [configureMcp, setConfigureMcp] = useState('Enabled')

    // 自动换号设置
    const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(false)
    const [autoSwitchThreshold, setAutoSwitchThreshold] = useState(1)
    const [autoSwitchInterval, setAutoSwitchInterval] = useState(5)

    // 定时切换账号设置
    const [autoRotateAccount, setAutoRotateAccount] = useState(false)
    const [autoRotateInterval, setAutoRotateInterval] = useState(5)
    const [autoRotateStrategy, setAutoRotateStrategy] = useState('sequential')

    // 关闭窗口行为
    const [closeToTray, setCloseToTray] = useState(false)

    // Kiro IDE 状态
    const [, setLoading] = useState(false)

    // 系统机器码
    const [systemMachineInfo, setSystemMachineInfo] = useState<any>(null)
    const [machineGuidAction, setMachineGuidAction] = useState<string | null>(null) // 'reset'

    // 应用数据目录
    const [appDataDir, setAppDataDir] = useState<string>('')

    // 加载设置（指纹延迟加载，不阻塞页面）
    const loadSettings = useCallback(async () => {
        setLoading(true)
        try {
            // 先加载核心设置（快速）
            const [kiroSettings, appSettings, sysMachine, kiroPath, ideInfo, dataDir] = await Promise.all([
                invoke<any>('get_kiro_settings').catch(() => null),
                invoke<any>('get_app_settings').catch(() => null),
                invoke<any>('get_system_machine_guid').catch(() => null),
                invoke<string | null>('get_custom_kiro_path').catch(() => null),
                invoke<any>('check_ide_installation').catch(() => null),
                invoke<string>('get_app_data_dir').catch(() => '')
            ])
            setSystemMachineInfo(sysMachine)
            // 优先显示自定义路径，否则显示检测到的默认路径
            setCustomKiroPath(kiroPath || (ideInfo?.ide_path || null))
            setAppDataDir(dataDir)

            // 从 Kiro IDE 设置读取
            if (kiroSettings) {
                const proxy = kiroSettings.httpProxy || ''
                setHttpProxy(proxy)
                setOriginalProxy(proxy)
                setAiModel(kiroSettings.modelSelection || 'claude-sonnet-4.5')
                setEnableCodebaseIndexing(kiroSettings.enableCodebaseIndexing ?? true)
                setTrustedCommandsMode(kiroSettings.trustedCommandsMode || 'none')
                setCustomTrustedCommands(kiroSettings.customTrustedCommands || '')
                // Agent 设置
                setAgentAutonomy(kiroSettings.agentAutonomy || 'Supervised')
                setEnableTabAutocomplete(kiroSettings.enableTabAutocomplete ?? true)
                setUsageSummary(kiroSettings.usageSummary ?? true)
                setEnableDebugLogs(kiroSettings.enableDebugLogs ?? false)
                // 新增设置
                setTrustedTools((kiroSettings.trustedTools || []).join(', '))
                setReferenceTracker(kiroSettings.referenceTracker ?? false)
                setConfigureMcp(kiroSettings.configureMcp || 'Enabled')
            }
            // 从应用设置读取
            if (appSettings) {
                setLockModel(appSettings.lockModel ?? false)
                setAutoRefresh(appSettings.autoRefresh ?? true)
                setAutoRefreshInterval(appSettings.autoRefreshInterval ?? 50)
                const browser = appSettings.browserPath || ''
                setBrowserPath(browser)
                setOriginalBrowserPath(browser)
                // 自动换号设置
                setAutoSwitchEnabled(appSettings.autoSwitchEnabled ?? false)
                setAutoSwitchThreshold(appSettings.autoSwitchThreshold ?? 1)
                setAutoSwitchInterval(appSettings.autoSwitchInterval ?? 5)
                // 定时切换账号设置
                setAutoRotateAccount(appSettings.autoRotateAccount ?? false)
                setAutoRotateInterval(appSettings.autoRotateInterval ?? 5)
                setAutoRotateStrategy(appSettings.autoRotateStrategy ?? 'sequential')
                // 关闭窗口行为
                setCloseToTray(appSettings.closeToTray ?? false)
                setAppProxyMode(appSettings.appProxyMode || 'followKiro')
            }
        } catch (err) {
            console.error('Failed to load settings:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    const saveAppSettings = (updates: any, notifyChange = false) => persistAppSettings({
        updates,
        notifyChange,
        updateAppSettings,
        emitFn: emit,
        showError,
        t})

    const runKiroCommand = (command: string, commandArgs: any, appSettingsUpdates: any = null, notifyChange = false) => runKiroCommandWithAppSettings({
        command,
        commandArgs,
        appSettingsUpdates,
        notifyChange,
        invokeFn: invoke,
        persistSettings: ({ updates, notifyChange: shouldNotify }: any) => saveAppSettings(updates, shouldNotify),
        showError,
        t})

    const handleApplyProxy = async () => {
        if (!isValidProxy(httpProxy)) {
            await showError(t('settings.saveFailed'), t('settings.invalidProxyFormat'))
            return
        }

        setSavingProxy(true)
        try {
            await invoke('set_kiro_proxy', { proxy: httpProxy })
            setOriginalProxy(httpProxy)
            await showSuccess(t('settings.saveSuccess'), httpProxy ? t('settings.proxyApplied') : t('settings.proxyCleared'))
        } catch (err: any) {
            await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
        } finally {
            setSavingProxy(false)
        }
    }

    const handleAppProxyModeChange = async (mode: string) => {
        setAppProxyMode(mode)
        await saveAppSettings({ appProxyMode: mode })
    }

    const handleApplyModel = async (model: string) => {
        setAiModel(model)
        setSavingModel(true)
        try {
            await invoke('set_kiro_model', { model })
            if (lockModel) {
                await saveAppSettings({ lockedModel: model })
            }
        } catch (err: any) {
            await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
        } finally {
            setSavingModel(false)
        }
    }

    const handleLockModelChange = async (checked: boolean) => {
        setLockModel(checked)
        await saveAppSettings({ lockModel: checked, lockedModel: checked ? aiModel : null })
    }

    const handleAutoRefreshChange = makeAppBoolToggle(setAutoRefresh, 'autoRefresh', saveAppSettings, true)

    const handleAutoRefreshIntervalChange = async (value: string) => {
        const interval = parseInt(value) || 50
        setAutoRefreshInterval(interval)
        await saveAppSettings({ autoRefreshInterval: interval }, true)
    }

    const handleAutoSwitchEnabledChange = makeAppBoolToggle(setAutoSwitchEnabled, 'autoSwitchEnabled', saveAppSettings, true)

    const handleAutoSwitchThresholdChange = async (value: any) => {
        const parsedValue = typeof value === 'number' ? value : parseFloat(value)
        const threshold = Number.isFinite(parsedValue) ? parsedValue : 1
        setAutoSwitchThreshold(threshold)
        await saveAppSettings({ autoSwitchThreshold: threshold }, true)
    }

    const handleAutoSwitchIntervalChange = async (value: string) => {
        const interval = parseInt(value) || 5
        setAutoSwitchInterval(interval)
        await saveAppSettings({ autoSwitchInterval: interval }, true)
    }

    const handleAutoRotateAccountChange = makeAppBoolToggle(setAutoRotateAccount, 'autoRotateAccount', saveAppSettings, true)

    const handleAutoRotateIntervalChange = async (value: string) => {
        const interval = parseInt(value) || 5
        setAutoRotateInterval(interval)
        await saveAppSettings({ autoRotateInterval: interval }, true)
    }

    const handleAutoRotateStrategyChange = async (value: string) => {
        setAutoRotateStrategy(value)
        await saveAppSettings({ autoRotateStrategy: value }, true)
    }

    const handleCloseToTrayChange = makeAppBoolToggle(setCloseToTray, 'closeToTray', saveAppSettings)

    const handleBrowseKiroPath = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog')
            const selected = await open({
                directory: false,
                multiple: false,
                filters: [{
                    name: 'Kiro',
                    extensions: window.navigator.platform.toLowerCase().includes('win') ? ['exe'] : []
                }]
            })

            if (selected) {
                await invoke('set_custom_kiro_path', { path: selected })
                setCustomKiroPath(selected)
                showSuccess(t('settings.kiroPathSaved'))
            }
        } catch (error) {
            showError(String(error))
        }
    }

    const handleClearKiroPath = async () => {
        try {
            await invoke('clear_custom_kiro_path')
            setCustomKiroPath(null)
            showSuccess(t('settings.kiroPathCleared'))
        } catch (error) {
            showError(String(error))
        }
    }

    const handleCodebaseIndexingChange = makeKiroBoolToggle(setEnableCodebaseIndexing, runKiroCommand, 'set_kiro_codebase_indexing', 'enableCodebaseIndexing')

    const handleTrustedCommandsModeChange = async (mode: string) => {
        if (!mode) return
        if (mode === 'all') {
            const confirmed = await showConfirm(
                t('settings.trustedCommandsAllConfirmTitle'),
                t('settings.trustedCommandsAllConfirmMessage'),
                { confirmText: t('settings.trustedCommandsAllConfirmAction'), cancelText: t('common.cancel') }
            )
            if (!confirmed) return
        }
        setTrustedCommandsMode(mode)
        try {
            await invoke('set_kiro_trusted_commands', { mode, customCommands: customTrustedCommands })
        } catch (err: any) {
            await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
        }
    }

    const handleCustomTrustedCommandsChange = async (commands: string) => {
        setCustomTrustedCommands(commands)
        if (trustedCommandsMode === 'common') {
            try {
                await invoke('set_kiro_trusted_commands', { mode: 'common', customCommands: commands })
            } catch (err: any) {
                await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
            }
        }
    }

    const handleAgentAutonomyChange = async (mode: string) => {
        setAgentAutonomy(mode)
        await runKiroCommand('set_kiro_agent_autonomy', { autonomy: mode })
    }

    const handleTabAutocompleteChange = makeKiroBoolToggle(setEnableTabAutocomplete, runKiroCommand, 'set_kiro_tab_autocomplete', 'enableTabAutocomplete')

    const handleUsageSummaryChange = makeKiroBoolToggle(setUsageSummary, runKiroCommand, 'set_kiro_usage_summary', 'usageSummary')

    const handleDebugLogsChange = makeKiroBoolToggle(setEnableDebugLogs, runKiroCommand, 'set_kiro_debug_logs', 'enableDebugLogs')

    const handleTrustedToolsSave = async (value: string) => {
        setTrustedTools(value)
        const tools = value.split(',').map(s => s.trim()).filter(Boolean)
        await runKiroCommand('set_kiro_trusted_tools', { tools }, { trustedTools: tools })
    }

    const handleReferenceTrackerChange = makeKiroBoolToggle(setReferenceTracker, runKiroCommand, 'set_kiro_reference_tracker', 'referenceTracker')

    const handleConfigureMcpChange = async (mode: string) => {
        setConfigureMcp(mode)
        await runKiroCommand('set_kiro_configure_mcp', { mode }, { configureMcp: mode })
    }

    const handleApplyBrowser = async () => {
        if (!isValidBrowserPath(browserPath)) {
            await showError(t('settings.saveFailed'), t('settings.invalidBrowserPath'))
            return
        }

        setSavingBrowser(true)
        try {
            await saveAppSettings({ browserPath: browserPath })
            setOriginalBrowserPath(browserPath)
            await showSuccess(t('settings.saveSuccess'), browserPath ? t('settings.browserSaved') : t('settings.defaultBrowser'))
        } catch (err: any) {
            await showError(t('settings.saveFailed'), err.toString())
        } finally {
            setSavingBrowser(false)
        }
    }

    const handleDetectBrowsers = async () => {
        try {
            const browsers = await invoke<any[]>('detect_installed_browsers')
            setDetectedBrowsers(browsers)
            setShowBrowserList(true)
        } catch (err: any) {
            await showError(t('settings.detectFailed'), err.toString())
        }
    }

    const handleDetectProxy = async () => {
        setDetectingProxy(true)
        try {
            const proxyInfo = await invoke<any>('detect_system_proxy')
            if (proxyInfo.enabled && proxyInfo.httpProxy) {
                setHttpProxy(proxyInfo.httpProxy)
                await showSuccess(t('settings.detectSuccess'), `${t('settings.systemProxyDetected')}: ${proxyInfo.httpProxy}`)
            } else {
                await showError(t('settings.noProxyDetected'), t('settings.noProxyConfigured'))
            }
        } catch (err: any) {
            await showError(t('settings.detectFailed'), err.toString())
        } finally {
            setDetectingProxy(false)
        }
    }

    const handleResetSystemMachineGuid = async () => {
        const confirmed = await showConfirm(
            `⚠️ ${t('settings.resetSystemMachineGuid')}`,
            t('settings.confirmResetSystemMachineGuid'),
            { confirmText: t('settings.confirmReset'), cancelText: t('common.cancel') }
        )
        if (!confirmed) return

        setMachineGuidAction('reset')
        try {
            const newGuid = await invoke<string>('reset_system_machine_guid')
            setSystemMachineInfo((prev: any) => ({ ...prev, machineGuid: newGuid }))
            await showSuccess(t('settings.resetSuccess'), `${t('settings.newMachineGuid')}: ${newGuid}`)
        } catch (err: any) {
            await showError(t('settings.resetFailed'), err.toString())
            setMachineGuidAction(null)
        }
    }

    const handleOpenAppDataDir = async () => {
        try {
            await invoke('open_app_data_dir')
        } catch (err: any) {
            await showError(t('settings.openFailed'), err.toString())
        }
    }

    return (
        <div className="h-full glass-main p-6 overflow-auto">
            <div className="w-full relative">
                {/* Header（紧凑 + 装饰 ring）*/}
                <div className="mb-4 flex items-center gap-3 animate-slide-in-left">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shadow-md ring-1 ring-primary/20">
                        <SettingsIcon size={20} className="text-primary-foreground" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-semibold text-foreground leading-tight">{t('settings.title')}</h1>
                        <p className="text-sm text-muted-foreground leading-tight">{t('settings.subtitle')}</p>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="glass-card mb-4 flex h-10 w-full justify-start overflow-x-auto rounded-lg border-none p-0.5 no-scrollbar lg:w-fit">
                        <TabsTrigger value="general" className="gap-1.5 px-3 h-9 shrink-0 text-sm font-medium data-[state=active]:shadow-sm">
                            <LayoutDashboard size={14} />
                            {t('settings.general')}
                        </TabsTrigger>
                        <TabsTrigger value="appearance" className="gap-1.5 px-3 h-9 shrink-0 text-sm font-medium data-[state=active]:shadow-sm">
                            <Palette size={14} />
                            {t('settings.appearance')}
                        </TabsTrigger>
                        <TabsTrigger value="kiro" className="gap-1.5 px-3 h-9 shrink-0 text-sm font-medium data-[state=active]:shadow-sm">
                            <Cpu size={14} />
                            {t('settings.kiro')}
                        </TabsTrigger>
                        <TabsTrigger value="notifications" className="gap-1.5 px-3 h-9 shrink-0 text-sm font-medium data-[state=active]:shadow-sm">
                            <Bell size={14} />
                            {t('settings.notifications')}
                        </TabsTrigger>
                        <TabsTrigger value="rotateLog" className="gap-1.5 px-3 h-9 shrink-0 text-sm font-medium data-[state=active]:shadow-sm">
                            <History size={14} />
                            轮换日志
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="general">
                        <SettingsGeneral
                            autoRefresh={autoRefresh}
                            autoRefreshInterval={autoRefreshInterval}
                            privacyMode={privacyMode}
                            setPrivacyMode={setPrivacyMode}
                            autoSwitchEnabled={autoSwitchEnabled}
                            autoSwitchThreshold={autoSwitchThreshold}
                            autoSwitchInterval={autoSwitchInterval}
                            closeToTray={closeToTray}
                            browserPath={browserPath}
                            setBrowserPath={setBrowserPath}
                            originalBrowserPath={originalBrowserPath}
                            savingBrowser={savingBrowser}
                            detectedBrowsers={detectedBrowsers}
                            showBrowserList={showBrowserList}
                            setShowBrowserList={setShowBrowserList}
                            customKiroPath={customKiroPath}
                            handleBrowseKiroPath={handleBrowseKiroPath}
                            handleClearKiroPath={handleClearKiroPath}
                            systemMachineInfo={systemMachineInfo}
                            machineGuidAction={machineGuidAction}
                            handleResetSystemMachineGuid={handleResetSystemMachineGuid}
                            handleDetectBrowsers={handleDetectBrowsers}
                            handleApplyBrowser={handleApplyBrowser}
                            handleAutoRefreshChange={handleAutoRefreshChange}
                            handleAutoRefreshIntervalChange={handleAutoRefreshIntervalChange}
                            handleAutoSwitchEnabledChange={handleAutoSwitchEnabledChange}
                            handleAutoSwitchThresholdChange={handleAutoSwitchThresholdChange}
                            handleAutoSwitchIntervalChange={handleAutoSwitchIntervalChange}
                            handleCloseToTrayChange={handleCloseToTrayChange}
                            autoRotateAccount={autoRotateAccount}
                            autoRotateInterval={autoRotateInterval}
                            autoRotateStrategy={autoRotateStrategy}
                            handleAutoRotateAccountChange={handleAutoRotateAccountChange}
                            handleAutoRotateIntervalChange={handleAutoRotateIntervalChange}
                            handleAutoRotateStrategyChange={handleAutoRotateStrategyChange}
                            appDataDir={appDataDir}
                            handleOpenAppDataDir={handleOpenAppDataDir}
                            t={t}
                        />
                    </TabsContent>

                    <TabsContent value="appearance">
                        <SettingsAppearance
                            theme={theme}
                            setTheme={setTheme}
                            t={t}
                        />
                    </TabsContent>

                    <TabsContent value="kiro">
                        <SettingsKiro
                            aiModel={aiModel}
                            lockModel={lockModel}
                            agentAutonomy={agentAutonomy}
                            trustedCommandsMode={trustedCommandsMode}
                            customTrustedCommands={customTrustedCommands}
                            trustedTools={trustedTools}
                            setTrustedTools={setTrustedTools}
                            configureMcp={configureMcp}
                            httpProxy={httpProxy}
                            setHttpProxy={setHttpProxy}
                            originalProxy={originalProxy}
                            appProxyMode={appProxyMode}
                            savingProxy={savingProxy}
                            detectingProxy={detectingProxy}
                            savingModel={savingModel}
                            enableCodebaseIndexing={enableCodebaseIndexing}
                            enableTabAutocomplete={enableTabAutocomplete}
                            usageSummary={usageSummary}
                            enableDebugLogs={enableDebugLogs}
                            referenceTracker={referenceTracker}
                            handleApplyModel={handleApplyModel}
                            handleLockModelChange={handleLockModelChange}
                            handleAgentAutonomyChange={handleAgentAutonomyChange}
                            handleTrustedCommandsModeChange={handleTrustedCommandsModeChange}
                            handleCustomTrustedCommandsChange={handleCustomTrustedCommandsChange}
                            handleTrustedToolsSave={handleTrustedToolsSave}
                            handleConfigureMcpChange={handleConfigureMcpChange}
                            handleApplyProxy={handleApplyProxy}
                            handleDetectProxy={handleDetectProxy}
                            handleAppProxyModeChange={handleAppProxyModeChange}
                            handleCodebaseIndexingChange={handleCodebaseIndexingChange}
                            handleTabAutocompleteChange={handleTabAutocompleteChange}
                            handleUsageSummaryChange={handleUsageSummaryChange}
                            handleDebugLogsChange={handleDebugLogsChange}
                            handleReferenceTrackerChange={handleReferenceTrackerChange}
                            t={t}
                        />
                    </TabsContent>

                    <TabsContent value="notifications">
                        <SettingsNotifications />
                    </TabsContent>

                    <TabsContent value="rotateLog">
                        <AccountRotateLog />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

export default Settings

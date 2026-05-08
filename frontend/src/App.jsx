import { useEffect, useMemo, useRef, useState } from 'react'
import cover640 from '../../assets/launcher/cover-640.webp'
import cover960 from '../../assets/launcher/cover-960.webp'
import cover1280 from '../../assets/launcher/cover-1280.webp'
import cover1920 from '../../assets/launcher/cover-1920.webp'
import cover2560 from '../../assets/launcher/cover-2560.webp'
import cover3840 from '../../assets/launcher/cover-3840.webp'
import coverFallback from '../../assets/launcher/cover-fallback.jpg'
import './App.css'

const launcherSources = {
  cover640,
  cover960,
  cover1280,
  cover1920,
  cover2560,
  cover3840,
  coverFallback,
}

const messages = {
  zh_cn: {
    appTitle: 'AI沙盒游戏',
    appSubtitle: 'AI Sandbox Game',
    guest: '访客',
    online: '在线',
    loginRequired: '需要登录',
    logout: '退出登录',
    login: '登录',
    register: '注册',
    username: '用户名',
    password: '密码',
    createAccount: '创建账号',
    switchToRegister: '没有账号，注册',
    switchToLogin: '已有账号，登录',
    newAdventure: '开始新旅程',
    newAdventureEn: 'Start New Adventure',
    continueAdventure: '继续冒险',
    continueAdventureEn: 'Continue Adventure',
    designWorld: '设计新世界',
    designWorldEn: 'Design New World',
    refreshSession: '刷新资料',
    refreshSessionEn: 'Refresh Session',
    worldCards: '世界卡',
    noWorldCards: '后端还没有返回世界卡。',
    noDescription: '未记录',
    noSaveLoaded: '未载入存档',
    saves: '存档',
    noSavesForWorld: '这个世界还没有存档。',
    chooseWorldFirst: '先选择一个世界。',
    modelSettings: '模型设置',
    settings: '设置',
    close: '关闭',
    userSettings: '用户设置',
    apiKeys: 'API Keys',
    configured: '已配置',
    notConfigured: '未配置',
    updateKey: '更新 Key',
    deleteKey: '删除 Key',
    systemSettings: '系统设置',
    registrationEnabled: '允许注册',
    builtinProviders: '内置服务商',
    users: '用户',
    role: '角色',
    providerLabel: '服务商',
    customProviderLabel: '自定义服务商',
    customProviderPlaceholder: '选择服务商',
    noCustomProviders: '还没有自定义服务商。',
    adminProviders: '管理员服务商',
    providerName: '服务商名称',
    providerType: '类型',
    providerUrl: 'Base URL',
    createProvider: '新增服务商',
    providerCreated: '自定义服务商已创建',
    providerUpdated: '自定义服务商已更新',
    providerDeleted: '自定义服务商已删除',
    editProvider: '编辑',
    deleteProvider: '删除',
    cancelEdit: '取消编辑',
    updateProvider: '保存修改',
    confirmDeleteProvider: '确定删除这个服务商？',
    openaiCompatible: 'OpenAI 兼容',
    ollama: 'Ollama',
    modelLabel: '模型',
    apiKey: 'API Key',
    saveKey: '保存 Key',
    keySaved: 'API Key 已存入后端',
    loggedIn: '已登录',
    registered: '账号已创建',
    loggedOut: '已退出登录',
    refreshed: '已刷新',
    noSlot: '没有可用的存档槽。',
    autoSave: '自动存档',
    newRun: '新旅程',
    backLauncher: '返回启动器',
    status: '状态',
    inventory: '物品',
    npc: 'NPC',
    phone: '短信',
    world: '世界',
    timeline: '时间线',
    statusPanel: '状态面板',
    model: '模型',
    send: '发送',
    inputPlaceholder: '输入行动、对话，或 OOC 指令...',
    turnPending: '正在推进回合...',
    chooseWorldToStart: '选择一个世界开始',
    journeyNotStarted: '旅程尚未开始。',
    openingGuide: '开场引导',
    worldDescription: '世界描述',
    worldSetting: '世界设定',
    runtimeWorld: '运行期世界',
    reactTrace: 'ReAct 流程',
    startRandom: '随机开始',
    startRecommended: '以推荐剧情开始',
    startCustom: '自定义开局',
    startCustomHint: '在下方输入时间、地点、身份或目标后发送。',
    noOpeningGreeting: '这个世界还没有配置开场白。你可以直接输入行动开始。',
    summary: '剧情总结',
    protagonist: '主角',
    gameMode: '游戏模式',
    designMode: '设计模式',
    time: '时间',
    location: '地点',
    objective: '目标',
    money: '金钱',
    freeAction: '自由行动',
    noInventory: '暂无物品变化。',
    acquired: '已获得',
    characters: '角色',
    npcEmpty: 'NPC 信息会在后端状态更新后显示。',
    unknownStatus: '状态未知',
    noSms: '暂无短信线程。',
    newSave: '新存档',
    noSaves: '还没有存档。',
    noTimeline: '暂无时间线事件。',
    you: '你',
    gm: 'GM',
    unnamedWorld: '未命名世界',
    contact: '联系人',
    item: '物品',
    language: '语言',
    chinese: '中文',
    english: 'English',
  },
  en_us: {
    appTitle: 'AI Sandbox Game',
    appSubtitle: 'AI沙盒游戏',
    guest: 'Guest',
    online: 'Online',
    loginRequired: 'Login required',
    logout: 'Log out',
    login: 'Log in',
    register: 'Register',
    username: 'Username',
    password: 'Password',
    createAccount: 'Create account',
    switchToRegister: 'No account? Register',
    switchToLogin: 'Already have an account? Log in',
    newAdventure: 'Start New Adventure',
    newAdventureEn: '开始新旅程',
    continueAdventure: 'Continue Adventure',
    continueAdventureEn: '继续冒险',
    designWorld: 'Design New World',
    designWorldEn: '设计新世界',
    refreshSession: 'Refresh Session',
    refreshSessionEn: '刷新资料',
    worldCards: 'World Cards',
    noWorldCards: 'No world cards returned by the backend.',
    noDescription: 'Not recorded',
    noSaveLoaded: 'No save loaded',
    saves: 'Saves',
    noSavesForWorld: 'No saves for this world yet.',
    chooseWorldFirst: 'Choose a world first.',
    modelSettings: 'Model Settings',
    settings: 'Settings',
    close: 'Close',
    userSettings: 'User Settings',
    apiKeys: 'API Keys',
    configured: 'Configured',
    notConfigured: 'Not configured',
    updateKey: 'Update Key',
    deleteKey: 'Delete Key',
    systemSettings: 'System Settings',
    registrationEnabled: 'Registration Enabled',
    builtinProviders: 'Built-in Providers',
    users: 'Users',
    role: 'Role',
    providerLabel: 'Provider',
    customProviderLabel: 'Custom Provider',
    customProviderPlaceholder: 'Select provider',
    noCustomProviders: 'No custom providers yet.',
    adminProviders: 'Admin Providers',
    providerName: 'Provider name',
    providerType: 'Type',
    providerUrl: 'Base URL',
    createProvider: 'Add Provider',
    providerCreated: 'Custom provider created',
    providerUpdated: 'Custom provider updated',
    providerDeleted: 'Custom provider deleted',
    editProvider: 'Edit',
    deleteProvider: 'Delete',
    cancelEdit: 'Cancel Edit',
    updateProvider: 'Save Changes',
    confirmDeleteProvider: 'Delete this provider?',
    openaiCompatible: 'OpenAI compatible',
    ollama: 'Ollama',
    modelLabel: 'Model',
    apiKey: 'API Key',
    saveKey: 'Save Key',
    keySaved: 'API key stored in backend KMS',
    loggedIn: 'Logged in',
    registered: 'Account created',
    loggedOut: 'Logged out',
    refreshed: 'Refreshed',
    noSlot: 'No save slot is available.',
    autoSave: 'Auto Save',
    newRun: 'New Journey',
    backLauncher: 'Back to launcher',
    status: 'Status',
    inventory: 'Inventory',
    npc: 'NPC',
    phone: 'Messages',
    world: 'World',
    timeline: 'Timeline',
    statusPanel: 'Status Panel',
    model: 'Model',
    send: 'Send',
    inputPlaceholder: 'Enter an action, dialogue, or OOC command...',
    turnPending: 'Advancing turn...',
    chooseWorldToStart: 'Choose a world to start',
    journeyNotStarted: 'The journey has not started yet.',
    openingGuide: 'Opening Guide',
    worldDescription: 'World Description',
    worldSetting: 'World Setting',
    runtimeWorld: 'Runtime World',
    reactTrace: 'ReAct Trace',
    startRandom: 'Random Start',
    startRecommended: 'Recommended Story Start',
    startCustom: 'Custom Opening',
    startCustomHint: 'Enter a time, location, identity, or goal below, then send.',
    noOpeningGreeting: 'This world has no opening greeting yet. You can type an action to begin.',
    summary: 'Story Summary',
    protagonist: 'Protagonist',
    gameMode: 'Game Mode',
    designMode: 'Design Mode',
    time: 'Time',
    location: 'Location',
    objective: 'Objective',
    money: 'Money',
    freeAction: 'Free action',
    noInventory: 'No inventory changes yet.',
    acquired: 'Acquired',
    characters: 'Characters',
    npcEmpty: 'NPC data will appear after backend state updates.',
    unknownStatus: 'Unknown status',
    noSms: 'No message threads yet.',
    newSave: 'New Save',
    noSaves: 'No saves yet.',
    noTimeline: 'No timeline events yet.',
    you: 'You',
    gm: 'GM',
    unnamedWorld: 'Unnamed world',
    contact: 'Contact',
    item: 'Item',
    language: 'Language',
    chinese: '中文',
    english: 'English',
  },
}

const providers = [
  'openai',
  'deepseek',
  'anthropic',
  'gemini',
  'grok',
  'siliconflow',
  'openrouter',
  'custom',
]

const defaultLlm = {
  provider: 'openai',
  model: 'gpt-5.4',
  temperature: '',
  max_tokens: '',
  custom_provider_id: '',
}

const defaultCustomProviderDraft = {
  name: '',
  provider: 'openai-compatible',
  url: '',
}

const emptySaveData = {
  history: [],
  summaries: [],
  inventory_data: { items: [] },
  timeline_events: { events: [] },
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function resolveInitialLocale() {
  const stored = localStorage.getItem('sandbox_locale')
  if (stored === 'zh_cn' || stored === 'en_us') return stored
  const language = navigator.language || navigator.languages?.[0] || ''
  return /^en/i.test(language) ? 'en_us' : 'zh_cn'
}

function getContentLocale(locale) {
  return locale === 'en_us' ? 'en' : 'zh-CN'
}

function normalizeText(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return JSON.stringify(value, null, 2)
}

function compactDate(value, locale, fallback) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale === 'en_us' ? 'en-US' : 'zh-CN')
}

function getMessageText(message) {
  if (message?.meta === 'ooc_qa') {
    return `${message.question || 'OOC'}\n${message.answer || ''}`.trim()
  }
  return normalizeText(message?.text)
}

function getSenderLabel(sender, t) {
  if (sender === 'user') return t.you
  if (sender === 'assistant' || sender === 'ai') return t.gm
  return sender || 'system'
}

function getItems(save) {
  const data = save?.inventory_data
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.items)) return data.items
  if (data.inventory && Array.isArray(data.inventory)) return data.inventory
  return Object.entries(data).map(([name, value]) => ({ name, value }))
}

function getCharacters(save) {
  const stores = [
    save?.npc_data?.npc_data,
    save?.npc_data?.characters,
    save?.npc_data?.npcs,
    save?.character_states?.characters,
    save?.character_states,
  ]
  const source = stores.find(Boolean)
  if (!source) return []
  if (Array.isArray(source)) return source
  return Object.entries(source).map(([name, data]) => ({ name, ...(data || {}) }))
}

function getSummaries(save) {
  const summaries = save?.summaries
  if (!Array.isArray(summaries)) return []
  return summaries
    .map((entry, index) => ({
      id: entry.uid || entry.id || `${entry.type || 'summary'}-${entry.turn_number || index}`,
      text: entry.text || entry.summary || normalizeText(entry),
      turn: entry.turn_number,
      type: entry.type,
    }))
    .filter((entry) => entry.text && entry.text !== '{}')
}

function getSmsThreads(save) {
  const sms = save?.sms_data
  if (!sms) return []
  if (Array.isArray(sms)) return sms
  if (Array.isArray(sms.threads)) return sms.threads
  if (Array.isArray(sms.contacts)) return sms.contacts
  return Object.entries(sms).map(([name, data]) => ({ name, ...(data || {}) }))
}

function getTimeline(save) {
  const timeline = save?.timeline_events
  if (!timeline) return []
  if (Array.isArray(timeline)) return timeline
  if (Array.isArray(timeline.events)) return timeline.events
  return []
}

function getRuntimeWorldEntries(save) {
  const entities = save?.entities?.entities
  if (!entities || typeof entities !== 'object') return []
  return Object.entries(entities)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => ({
      id: key,
      text: normalizeText(value?.text || value),
      origin: value?.origin || 'expanded',
    }))
}

function getLatestReactSegments(save) {
  const history = save?.history || []
  const latest = [...history].reverse().find((entry) => Array.isArray(entry.react_segments) && entry.react_segments.length)
  return latest?.react_segments || []
}

function asPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function getSnapshot(world) {
  return asPlainObject(world?.snapshot)
}

function getWorldSetting(world) {
  return asPlainObject(getSnapshot(world).world_setting)
}

function getPromptModules(world) {
  return asPlainObject(getSnapshot(world).prompt_modules)
}

function getWorldSummary(world) {
  const setting = getWorldSetting(world)
  const promptModules = getPromptModules(world)
  return (
    normalizeText(world?.description).trim() ||
    normalizeText(setting._summary || setting.summary).trim() ||
    normalizeText(promptModules._summary || promptModules.summary).trim()
  )
}

function getOpeningGreeting(world) {
  return normalizeText(getPromptModules(world).opening_greeting).trim()
}

function getWorldSettingEntries(world) {
  const settings = asPlainObject(getWorldSetting(world).settings)
  return Object.entries(settings)
    .filter(([key, value]) => key && !key.startsWith('_') && value)
    .slice(0, 8)
    .map(([key, value]) => ({ key, value: normalizeText(value) }))
}

async function api(path, options = {}) {
  const apiPath = path.startsWith('/api/') ? path : `/api${path}`
  const response = await fetch(apiPath, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (response.status === 204) return null

  const text = await response.text()
  const data = text ? safeJson(text, text) : null
  if (!response.ok) {
    const detail = data?.detail || data || response.statusText
    throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(', ') : detail)
  }
  return data
}

function makeLlmPayload(config) {
  return {
    provider: config.provider,
    model: config.model.trim() || defaultLlm.model,
    custom_provider_id: config.custom_provider_id ? Number(config.custom_provider_id) : null,
    base_url: null,
    temperature: config.temperature === '' ? null : Number(config.temperature),
    max_tokens: config.max_tokens === '' ? null : Number(config.max_tokens),
  }
}

function Section({ title, action, children }) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>
}

function LocaleSwitch({ locale, onLocaleChange, t }) {
  return (
    <label className="locale-switch">
      <span>{t.language}</span>
      <select value={locale} onChange={(event) => onLocaleChange(event.target.value)}>
        <option value="zh_cn">{t.chinese}</option>
        <option value="en_us">{t.english}</option>
      </select>
    </label>
  )
}

function CustomProviderSelect({ customProviders, llmConfig, setLlmConfig, t }) {
  if (llmConfig.provider !== 'custom') return null

  return (
    <label>
      {t.customProviderLabel}
      <select
        value={llmConfig.custom_provider_id}
        onChange={(event) => setLlmConfig({ ...llmConfig, custom_provider_id: event.target.value })}
        required
      >
        <option value="">{t.customProviderPlaceholder}</option>
        {customProviders.map((provider) => (
          <option key={provider.provider_id} value={provider.provider_id}>
            {provider.name} · {provider.provider}
          </option>
        ))}
      </select>
    </label>
  )
}

function ModelSettingsFields({ customProviders, llmConfig, setLlmConfig, t }) {
  return (
    <>
      <label>
        {t.providerLabel}
        <select
          value={llmConfig.provider}
          onChange={(event) =>
            setLlmConfig({
              ...llmConfig,
              provider: event.target.value,
              custom_provider_id: event.target.value === 'custom' ? llmConfig.custom_provider_id : '',
            })
          }
        >
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </label>
      <CustomProviderSelect
        customProviders={customProviders}
        llmConfig={llmConfig}
        setLlmConfig={setLlmConfig}
        t={t}
      />
      <label>
        {t.modelLabel}
        <input value={llmConfig.model} onChange={(event) => setLlmConfig({ ...llmConfig, model: event.target.value })} />
      </label>
      {llmConfig.provider === 'custom' && !customProviders.length ? <EmptyState>{t.noCustomProviders}</EmptyState> : null}
    </>
  )
}

function CustomProviderAdmin({ customProviders, draft, setDraft, editingId, onEdit, onCancelEdit, onSubmit, onDelete, t }) {
  return (
    <Section title={t.adminProviders}>
      {customProviders.length ? (
        <div className="provider-list">
          {customProviders.map((provider) => (
            <article className="provider-row" key={provider.provider_id}>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.provider}</span>
                <p>{provider.url}</p>
              </div>
              <div className="row-actions">
                <button type="button" className="secondary-button small" onClick={() => onEdit(provider)}>
                  {t.editProvider}
                </button>
                <button type="button" className="danger-button small" onClick={() => onDelete(provider.provider_id)}>
                  {t.deleteProvider}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noCustomProviders}</EmptyState>
      )}
      <form className="settings-grid" onSubmit={onSubmit}>
        <label>
          {t.providerName}
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
        </label>
        <label>
          {t.providerType}
          <select value={draft.provider} onChange={(event) => setDraft({ ...draft, provider: event.target.value })}>
            <option value="openai-compatible">{t.openaiCompatible}</option>
            <option value="ollama">{t.ollama}</option>
          </select>
        </label>
        <label className="wide-field">
          {t.providerUrl}
          <input
            value={draft.url}
            onChange={(event) => setDraft({ ...draft, url: event.target.value })}
            placeholder="http://127.0.0.1:11434/v1"
            required
          />
        </label>
        <button type="submit" className="secondary-button">
          {editingId ? t.updateProvider : t.createProvider}
        </button>
        {editingId ? (
          <button type="button" className="text-button" onClick={onCancelEdit}>
            {t.cancelEdit}
          </button>
        ) : null}
      </form>
    </Section>
  )
}

function SettingsModal({
  open,
  user,
  locale,
  t,
  onClose,
  onLocaleChange,
  llmConfig,
  setLlmConfig,
  apiKey,
  setApiKey,
  apiKeyStatuses,
  onSaveKey,
  onDeleteKey,
  customProviders,
  customProviderDraft,
  setCustomProviderDraft,
  editingCustomProviderId,
  onEditCustomProvider,
  onCancelCustomProviderEdit,
  onSubmitCustomProvider,
  onDeleteCustomProvider,
  systemConfig,
  setSystemConfig,
  onSaveSystemConfig,
  users,
  onUpdateUserRole,
}) {
  if (!open) return null
  const isAdmin = user?.role === 'admin'
  const builtinProviders = providers.filter((provider) => provider !== 'custom')
  const customProviderName = (providerId) =>
    customProviders.find((provider) => String(provider.provider_id) === String(providerId))?.name || providerId

  return (
    <div className="modal-backdrop">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <h2 id="settings-title">{t.settings}</h2>
          <button type="button" className="icon-button" onClick={onClose} title={t.close}>
            ×
          </button>
        </header>
        <div className="settings-modal-body">
          <Section title={t.userSettings}>
            <LocaleSwitch locale={locale} onLocaleChange={onLocaleChange} t={t} />
          </Section>

          {user ? (
            <>
              <Section title={t.modelSettings}>
                <form className="settings-grid" onSubmit={onSaveKey}>
                  <ModelSettingsFields customProviders={customProviders} llmConfig={llmConfig} setLlmConfig={setLlmConfig} t={t} />
                  <label className="wide-field">
                    {t.apiKey}
                    <input
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      type="password"
                      placeholder={t.apiKey}
                    />
                  </label>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={!apiKey.trim() || (llmConfig.provider === 'custom' && !llmConfig.custom_provider_id)}
                  >
                    {t.saveKey}
                  </button>
                </form>
              </Section>

              <Section title={t.apiKeys}>
                <div className="provider-list">
                  {apiKeyStatuses.map((status) => (
                    <article className="provider-row" key={`${status.provider}-${status.custom_provider_id || 'builtin'}`}>
                      <div>
                        <strong>
                          {status.provider === 'custom'
                            ? `${status.provider} · ${customProviderName(status.custom_provider_id)}`
                            : status.provider}
                        </strong>
                        <span>{status.exists ? t.configured : t.notConfigured}</span>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="danger-button small"
                          onClick={() => onDeleteKey(status)}
                          disabled={!status.exists}
                        >
                          {t.deleteKey}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </Section>
            </>
          ) : null}

          {isAdmin ? (
            <>
              <Section title={t.systemSettings}>
                <div className="settings-grid">
                  <label className="toggle-row wide-field">
                    <input
                      type="checkbox"
                      checked={systemConfig.registration_enabled}
                      onChange={(event) =>
                        setSystemConfig({ ...systemConfig, registration_enabled: event.target.checked })
                      }
                    />
                    {t.registrationEnabled}
                  </label>
                  <div className="wide-field checkbox-grid">
                    <strong>{t.builtinProviders}</strong>
                    {builtinProviders.map((provider) => (
                      <label key={provider} className="toggle-row">
                        <input
                          type="checkbox"
                          checked={!systemConfig.disabled_builtin_llm_providers.includes(provider)}
                          onChange={(event) => {
                            const disabled = new Set(systemConfig.disabled_builtin_llm_providers)
                            if (event.target.checked) {
                              disabled.delete(provider)
                            } else {
                              disabled.add(provider)
                            }
                            setSystemConfig({
                              ...systemConfig,
                              disabled_builtin_llm_providers: Array.from(disabled),
                            })
                          }}
                        />
                        {provider}
                      </label>
                    ))}
                  </div>
                  <button type="button" className="secondary-button" onClick={onSaveSystemConfig}>
                    {t.updateProvider}
                  </button>
                </div>
              </Section>

              <Section title={t.users}>
                <div className="provider-list">
                  {users.map((account) => (
                    <article className="provider-row" key={account.user_id}>
                      <div>
                        <strong>{account.username}</strong>
                        <span>#{account.user_id}</span>
                      </div>
                      <label className="role-select">
                        {t.role}
                        <select
                          value={account.role}
                          onChange={(event) => onUpdateUserRole(account.user_id, event.target.value)}
                          disabled={account.user_id === user.user_id}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                    </article>
                  ))}
                </div>
              </Section>

              <CustomProviderAdmin
                customProviders={customProviders}
                draft={customProviderDraft}
                setDraft={setCustomProviderDraft}
                editingId={editingCustomProviderId}
                onEdit={onEditCustomProvider}
                onCancelEdit={onCancelCustomProviderEdit}
                onSubmit={onSubmitCustomProvider}
                onDelete={onDeleteCustomProvider}
                t={t}
              />
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function Launcher({
  user,
  locale,
  t,
  onLocaleChange,
  worlds,
  saves,
  selectedWorldId,
  status,
  onSelectWorld,
  onLogin,
  onRegister,
  onLogout,
  onOpenWorld,
  onNewRun,
  onRefresh,
  onOpenSettings,
}) {
  const [authMode, setAuthMode] = useState('login')
  const [credentials, setCredentials] = useState({ username: '', password: '' })

  const selectedWorld = worlds.find((world) => world.id === selectedWorldId)
  const activeSaves = selectedWorldId ? saves[selectedWorldId] || [] : []

  async function submitAuth(event) {
    event.preventDefault()
    if (authMode === 'login') {
      await onLogin(credentials)
    } else {
      await onRegister(credentials)
    }
  }

  return (
    <main className="launcher">
      <picture className="launcher-bg" aria-hidden="true">
        <source
          type="image/webp"
          srcSet={`${launcherSources.cover640} 640w, ${launcherSources.cover960} 960w, ${launcherSources.cover1280} 1280w, ${launcherSources.cover1920} 1920w, ${launcherSources.cover2560} 2560w, ${launcherSources.cover3840} 3840w`}
          sizes="100vw"
        />
        <img
          src={launcherSources.coverFallback}
          srcSet={`${launcherSources.cover640} 640w, ${launcherSources.cover960} 960w, ${launcherSources.cover1280} 1280w, ${launcherSources.cover1920} 1920w, ${launcherSources.cover2560} 2560w, ${launcherSources.cover3840} 3840w`}
          sizes="100vw"
          alt=""
        />
      </picture>
      <div className="launcher-backdrop" />
      <div className="launcher-profile">
        <LocaleSwitch locale={locale} onLocaleChange={onLocaleChange} t={t} />
        <div>
          <strong>{user?.username || t.guest}</strong>
          <span>{user ? t.online : t.loginRequired}</span>
        </div>
        {user ? (
          <button type="button" className="icon-button" onClick={onLogout} title={t.logout}>
            ⇥
          </button>
        ) : null}
      </div>

      <section className="launcher-title">
        <h1>{t.appTitle}</h1>
        <p>{t.appSubtitle}</p>
      </section>

      <nav className="launcher-nav" aria-label="Launcher actions">
        <button type="button" className="launcher-action primary" onClick={onNewRun} disabled={!selectedWorldId}>
          <span>＋</span>
          <strong>{t.newAdventure}</strong>
          <small>{t.newAdventureEn}</small>
        </button>
        <button type="button" className="launcher-action" onClick={onOpenWorld} disabled={!selectedWorldId}>
          <span>▣</span>
          <strong>{t.continueAdventure}</strong>
          <small>{t.continueAdventureEn}</small>
        </button>
        <button type="button" className="launcher-action" disabled>
          <span>✎</span>
          <strong>{t.designWorld}</strong>
          <small>{t.designWorldEn}</small>
        </button>
        <button type="button" className="launcher-action" onClick={onRefresh}>
          <span>⟳</span>
          <strong>{t.refreshSession}</strong>
          <small>{t.refreshSessionEn}</small>
        </button>
        <button type="button" className="launcher-action" onClick={onOpenSettings}>
          <span>⚙</span>
          <strong>{t.settings}</strong>
          <small>{t.modelSettings}</small>
        </button>
      </nav>

      <aside className="launcher-dock">
        {!user ? (
          <Section title={authMode === 'login' ? t.login : t.register}>
            <form className="stack" onSubmit={submitAuth}>
              <input
                value={credentials.username}
                onChange={(event) => setCredentials({ ...credentials, username: event.target.value })}
                placeholder={t.username}
                autoComplete="username"
              />
              <input
                value={credentials.password}
                onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
                placeholder={t.password}
                type="password"
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              />
              <button type="submit" className="primary-button">
                {authMode === 'login' ? t.login : t.createAccount}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              >
                {authMode === 'login' ? t.switchToRegister : t.switchToLogin}
              </button>
            </form>
          </Section>
        ) : (
          <>
            <Section title={t.worldCards}>
              <div className="world-list">
                {worlds.length ? (
                  worlds.map((world) => (
                    <button
                      type="button"
                      className={`world-row ${world.id === selectedWorldId ? 'selected' : ''}`}
                      key={world.id}
                      onClick={() => onSelectWorld(world.id)}
                    >
                      <strong>{world.name || t.unnamedWorld}</strong>
                      <span>{world.description || world.content_locale || t.noDescription}</span>
                    </button>
                  ))
                ) : (
                  <EmptyState>{t.noWorldCards}</EmptyState>
                )}
              </div>
            </Section>
            <Section title={t.saves}>
              {selectedWorld ? (
                <div className="save-list">
                  {activeSaves.length ? (
                    activeSaves.map((save) => (
                      <div className="save-row" key={save.id}>
                        <strong>{save.name}</strong>
                        <span>{compactDate(save.progress_updated_at, locale, t.noDescription)}</span>
                      </div>
                    ))
                  ) : (
                    <EmptyState>{t.noSavesForWorld}</EmptyState>
                  )}
                </div>
              ) : (
                <EmptyState>{t.chooseWorldFirst}</EmptyState>
              )}
            </Section>
          </>
        )}
        {status ? <div className="status-line">{status}</div> : null}
      </aside>
    </main>
  )
}

function GameShell({
  locale,
  t,
  onLocaleChange,
  world,
  save,
  saves,
  pending,
  status,
  onSend,
  onChoose,
  onBack,
  onLoadSave,
  onNewRun,
  onOpenSettings,
}) {
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('summary')
  const messagesRef = useRef(null)

  const history = save?.history || []
  const lastAssistant = [...history].reverse().find((item) => item.sender === 'assistant' || item.sender === 'ai')
  const choices = lastAssistant?.game_data?.choices || []
  const panelStatus = lastAssistant?.game_data?.panel_status || save?.custom_status_data || null
  const items = getItems(save)
  const characters = getCharacters(save)
  const smsThreads = getSmsThreads(save)
  const summaries = getSummaries(save)
  const runtimeWorldEntries = getRuntimeWorldEntries(save)
  const reactSegments = getLatestReactSegments(save)
  const openingGreeting = getOpeningGreeting(world)
  const worldSummary = getWorldSummary(world)
  const worldSettingEntries = getWorldSettingEntries(world)
  const hasStarted = history.length > 0

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [history.length, pending])

  async function submit(event) {
    event.preventDefault()
    const text = message.trim()
    if (!text) return
    setMessage('')
    await onSend(text)
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="game-title-group">
          <button type="button" className="icon-button home-button" onClick={onBack} title={t.backLauncher}>
            ←
          </button>
          <div className="game-title">
            <strong>AI Sandbox Game</strong>
            <span>{world?.name || t.chooseWorldToStart}</span>
          </div>
          <div className="mode-toggle" title="Mode">
            <span className="active">{t.gameMode}</span>
            <span>{t.designMode}</span>
          </div>
        </div>
        <div className="header-tools" aria-label="Panels">
          {[
            ['summary', t.summary],
            ['character', t.protagonist],
            ['npc', t.characters],
            ['phone', t.phone],
            ['save', t.saves],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`tool-tile ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              <span className="tool-icon" aria-hidden="true">{key === 'summary' ? '▤' : key === 'character' ? '◎' : key === 'npc' ? '♟' : key === 'phone' ? '✉' : '▣'}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="tool-tile" onClick={onOpenSettings}>
          <span className="tool-icon" aria-hidden="true">⚙</span>
          {t.settings}
        </button>
        <LocaleSwitch locale={locale} onLocaleChange={onLocaleChange} t={t} />
      </header>

      <section className="chat-stage">
        <div className="chat-scroll" ref={messagesRef}>
          {hasStarted ? (
            history.map((entry, index) => (
              <article className={`message ${entry.sender === 'user' ? 'user' : 'assistant'}`} key={entry.uid || index}>
                <div className="message-meta">
                  <span>{getSenderLabel(entry.sender, t)}</span>
                  {entry.model_label ? <span>{entry.model_label}</span> : null}
                </div>
                <p>{getMessageText(entry)}</p>
                <ReactTrace segments={entry.react_segments} t={t} />
              </article>
            ))
          ) : (
            <OpeningPanel
              world={world}
              t={t}
              openingGreeting={openingGreeting}
              worldSummary={worldSummary}
              worldSettingEntries={worldSettingEntries}
              onStart={onChoose}
              onCustom={() => messagesRef.current?.parentElement?.querySelector('textarea')?.focus()}
              pending={pending}
            />
          )}
          {pending ? (
            <article className="message assistant pending">
              <div className="message-meta">
                <span>GM</span>
              </div>
              <p>{t.turnPending}</p>
            </article>
          ) : null}
        </div>

        {choices.length ? (
          <div className="game-choices">
            <div className="choices-header">
              <strong>{locale === 'en_us' ? 'Your Choices' : '你的选择？'}</strong>
            </div>
            <div className="choice-strip">
            {choices.map((choice) => (
              <button type="button" key={choice.id || choice.text} onClick={() => onChoose(choice.text)} disabled={pending}>
                <span className="choice-id">{choice.id}</span>
                <span className="choice-copy">
                  <strong>{choice.text}</strong>
                  <small>{choice.type || choice.type_tag || 'action'} · {choice.time_effect || choice.cost_hint || 'low'}</small>
                </span>
              </button>
            ))}
              <form className="choice-custom" onSubmit={submit}>
                <span className="choice-id">{String.fromCharCode(65 + choices.length)}</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t.inputPlaceholder}
                  rows={1}
                  disabled={pending}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form.requestSubmit()
                    }
                  }}
                />
                <button type="submit" className="send-button" disabled={pending || !message.trim()} title={t.send}>
                  ➤
                </button>
              </form>
            </div>
          </div>
        ) : null}

        <form className={`chat-input ${choices.length ? 'hidden-when-choices' : ''}`} onSubmit={submit}>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t.inputPlaceholder}
            rows={2}
            disabled={pending}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form.requestSubmit()
              }
            }}
          />
          <button type="submit" className="send-button" disabled={pending || !message.trim()} title={t.send}>
            ➤
          </button>
        </form>
      </section>

      <aside className="right-rail">
        {tab === 'summary' ? (
          <>
            <Section title={t.worldDescription}>
              <div className="world-summary">
                <strong>{world?.name}</strong>
                <p>{worldSummary || t.noDescription}</p>
              </div>
            </Section>
            <Section title={t.runtimeWorld}>
              <RuntimeWorldList entries={runtimeWorldEntries} t={t} />
            </Section>
            <Section title={t.summary}>
              <SummaryList summaries={summaries} t={t} />
            </Section>
            <Section title={t.reactTrace}>
              <ReactTrace segments={reactSegments} t={t} expanded />
            </Section>
            <Section title={t.status}>
              <StatusGrid status={panelStatus} save={save} t={t} />
            </Section>
          </>
        ) : null}
        {tab === 'character' ? (
          <>
            <StatusPanel status={panelStatus} save={save} t={t} />
            <InventoryPanel items={items} t={t} />
          </>
        ) : null}
        {tab === 'npc' ? <NpcPanel characters={characters} t={t} /> : null}
        {tab === 'phone' ? <PhonePanel threads={smsThreads} t={t} /> : null}
        {tab === 'save' ? (
          <SavePanel
            saves={saves}
            activeId={save?.id}
            locale={locale}
            t={t}
            onLoadSave={onLoadSave}
            onNewRun={onNewRun}
          />
        ) : null}
        {status ? <div className="status-line">{status}</div> : null}
      </aside>
    </main>
  )
}

function OpeningPanel({ world, t, openingGreeting, worldSummary, worldSettingEntries, onStart, onCustom, pending }) {
  return (
    <article className="opening-panel">
      <div className="opening-kicker">{t.openingGuide}</div>
      <h2>{world?.name || t.chooseWorldToStart}</h2>
      <p className="opening-summary">{worldSummary || t.journeyNotStarted}</p>
      <div className="opening-greeting">
        {openingGreeting || t.noOpeningGreeting}
      </div>
      {worldSettingEntries.length ? (
        <div className="opening-world-grid" aria-label={t.worldSetting}>
          {worldSettingEntries.slice(0, 4).map((entry) => (
            <div className="opening-world-cell" key={entry.key}>
              <strong>{entry.key}</strong>
              <span>{entry.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="opening-actions">
        <button type="button" className="primary-button" onClick={() => onStart('随机开始')} disabled={pending}>
          {t.startRandom}
        </button>
        <button type="button" className="secondary-button" onClick={() => onStart('以推荐剧情开始')} disabled={pending}>
          {t.startRecommended}
        </button>
        <button type="button" className="secondary-button" onClick={onCustom} disabled={pending}>
          {t.startCustom}
        </button>
      </div>
      <p className="opening-hint">{t.startCustomHint}</p>
    </article>
  )
}

function StatusGrid({ status, save, t }) {
  const rows = [
    [t.time, status?.datetime?.text || save?.game_time?.text || normalizeText(save?.game_time) || t.noDescription],
    [t.location, status?.location?.text || save?.location?.name || normalizeText(save?.location) || t.noDescription],
    [t.objective, status?.objective?.text || t.freeAction],
    [t.money, status?.money?.text || status?.money?.value || t.noDescription],
  ]
  return (
    <div className="status-grid">
      {rows.map(([label, value]) => (
        <div className="status-cell" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function StatusPanel({ status, save, t }) {
  const custom = status?.custom || save?.custom_status_data || {}
  return (
    <Section title={t.statusPanel}>
      <StatusGrid status={status} save={save} t={t} />
      {Object.keys(custom).length ? (
        <div className="kv-list">
          {Object.entries(custom).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{normalizeText(value)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </Section>
  )
}

function InventoryPanel({ items, t }) {
  return (
    <Section title={t.inventory}>
      {items.length ? (
        <div className="item-list">
          {items.map((item, index) => (
            <div className="item-row" key={`${item.name || index}-${index}`}>
              <strong>{item.name || item.id || `${t.item} ${index + 1}`}</strong>
              <span>{item.quantity ?? item.count ?? item.value ?? item.desc ?? t.acquired}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noInventory}</EmptyState>
      )}
    </Section>
  )
}

function NpcPanel({ characters, t }) {
  return (
    <Section title={t.characters}>
      {characters.length ? (
        <div className="npc-list">
          {characters.map((character, index) => (
            <article className="npc-row" key={`${character.name || index}-${index}`}>
              <strong>{character.name || character.id || `NPC ${index + 1}`}</strong>
              <span>{character.relationship || character.status || character.mood || t.unknownStatus}</span>
              {character.description || character.summary ? <p>{character.description || character.summary}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>{t.npcEmpty}</EmptyState>
      )}
    </Section>
  )
}

function PhonePanel({ threads, t }) {
  return (
    <Section title={t.phone}>
      {threads.length ? (
        <div className="phone-list">
          {threads.map((thread, index) => (
            <article className="phone-thread" key={`${thread.name || index}-${index}`}>
              <strong>{thread.name || thread.contact || `${t.contact} ${index + 1}`}</strong>
              <p>{normalizeText(thread.latest || thread.last_message || thread.messages || thread)}</p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noSms}</EmptyState>
      )}
    </Section>
  )
}

function SavePanel({ saves, activeId, locale, t, onLoadSave, onNewRun }) {
  return (
    <Section
      title={t.saves}
      action={
        <button type="button" className="secondary-button small" onClick={onNewRun}>
          {t.newSave}
        </button>
      }
    >
      {saves.length ? (
        <div className="save-list">
          {saves.map((save) => (
            <button
              type="button"
              className={`save-row button-row ${save.id === activeId ? 'selected' : ''}`}
              key={save.id}
              onClick={() => onLoadSave(save.id)}
            >
              <strong>{save.name}</strong>
              <span>{compactDate(save.progress_updated_at, locale, t.noDescription)}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>{t.noSaves}</EmptyState>
      )}
    </Section>
  )
}

function TimelineList({ events, t }) {
  return events.length ? (
    <ol className="timeline-list">
      {events.map((event, index) => (
        <li key={`${event.id || event.title || index}-${index}`}>{event.title || event.text || normalizeText(event)}</li>
      ))}
    </ol>
  ) : (
    <EmptyState>{t.noTimeline}</EmptyState>
  )
}

function RuntimeWorldList({ entries, t }) {
  return entries.length ? (
    <div className="world-runtime-list">
      {entries.map((entry) => (
        <article className="world-runtime-row" key={entry.id}>
          <strong>{entry.id}</strong>
          <span>{entry.origin}</span>
          <p>{entry.text}</p>
        </article>
      ))}
    </div>
  ) : (
    <EmptyState>{t.noDescription}</EmptyState>
  )
}

function SummaryList({ summaries, t }) {
  return summaries.length ? (
    <ol className="timeline-list">
      {summaries.map((entry, index) => (
        <li key={`${entry.id || index}-${index}`}>
          {entry.turn ? <strong>T{entry.turn}: </strong> : null}
          {entry.text}
        </li>
      ))}
    </ol>
  ) : (
    <EmptyState>{t.noTimeline}</EmptyState>
  )
}

function ReactTrace({ segments, t, expanded = false }) {
  if (!Array.isArray(segments) || !segments.length) return null
  return (
    <details className="react-trace" open={expanded}>
      <summary>{t.reactTrace}</summary>
      <div className="react-trace-list">
        {segments.map((segment, index) => (
          <div className="react-trace-row" key={`${segment.stage || 'stage'}-${index}`}>
            <strong>{segment.stage || `stage_${index + 1}`}</strong>
            <span>{Object.entries(segment)
              .filter(([key]) => key !== 'stage')
              .map(([key, value]) => `${key}: ${normalizeText(value)}`)
              .join(' · ')}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

export default function App() {
  const [locale, setLocaleState] = useState(resolveInitialLocale)
  const [user, setUser] = useState(null)
  const [worlds, setWorlds] = useState([])
  const [selectedWorldId, setSelectedWorldId] = useState('')
  const [activeWorldCard, setActiveWorldCard] = useState(null)
  const [savesByWorld, setSavesByWorld] = useState({})
  const [activeSave, setActiveSave] = useState(null)
  const [mode, setMode] = useState('launcher')
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyStatuses, setApiKeyStatuses] = useState([])
  const [systemConfig, setSystemConfig] = useState({
    registration_enabled: true,
    disabled_builtin_llm_providers: [],
  })
  const [users, setUsers] = useState([])
  const [llmConfig, setLlmConfigState] = useState(() => ({
    ...defaultLlm,
    ...safeJson(localStorage.getItem('sandbox_llm_config'), {}),
  }))
  const [customProviders, setCustomProviders] = useState([])
  const [customProviderDraft, setCustomProviderDraft] = useState(defaultCustomProviderDraft)
  const [editingCustomProviderId, setEditingCustomProviderId] = useState(null)
  const t = messages[locale]

  const selectedWorld = useMemo(
    () =>
      activeWorldCard?.id === selectedWorldId
        ? activeWorldCard
        : worlds.find((world) => world.id === selectedWorldId) || null,
    [activeWorldCard, selectedWorldId, worlds],
  )
  const selectedSaves = selectedWorldId ? savesByWorld[selectedWorldId] || [] : []

  function setLlmConfig(next) {
    setLlmConfigState(next)
    localStorage.setItem('sandbox_llm_config', JSON.stringify(next))
  }

  function setLocale(nextLocale) {
    const normalized = nextLocale === 'en_us' ? 'en_us' : 'zh_cn'
    setLocaleState(normalized)
    localStorage.setItem('sandbox_locale', normalized)
    document.documentElement.lang = normalized === 'en_us' ? 'en-US' : 'zh-CN'
    document.documentElement.dataset.uiLanguage = normalized
  }

  async function changeLocale(nextLocale) {
    setLocale(nextLocale)
    if (!user) return
    await api('/config', {
      method: 'PUT',
      body: JSON.stringify({ locale: nextLocale === 'en_us' ? 'en_us' : 'zh_cn' }),
    }).catch((error) => setStatus(error.message))
  }

  async function refreshWorlds() {
    const cards = await api(`/world-cards?locale=${encodeURIComponent(getContentLocale(locale))}`)
    setWorlds(cards)
    const active = await api('/world-cards/active').catch(() => null)
    const nextId = (typeof active === 'string' ? active : active?.id) || selectedWorldId || cards[0]?.id || ''
    setSelectedWorldId(nextId)
    if (nextId) await refreshSaves(nextId)
    return nextId
  }

  async function refreshCustomProviders() {
    const nextProviders = await api('/config/providers')
    setCustomProviders(nextProviders)
    return nextProviders
  }

  async function refreshUserConfig() {
    const payload = await api('/config')
    setApiKeyStatuses(payload.api_keys || [])
    if (payload.config?.locale) {
      setLocale(payload.config.locale)
    }
    return payload
  }

  async function refreshAdminConfig() {
    if (user?.role !== 'admin') return
    const [nextSystemConfig, nextUsers] = await Promise.all([
      api('/config/system'),
      api('/config/users'),
    ])
    setSystemConfig(nextSystemConfig)
    setUsers(nextUsers)
  }

  async function openSettings() {
    setSettingsOpen(true)
    if (!user) return
    await withStatus(async () => {
      await refreshCustomProviders()
      await refreshUserConfig()
      await refreshAdminConfig()
    })
  }

  async function refreshSaves(worldId) {
    const saves = await api(`/world-cards/${worldId}/saves`)
    setSavesByWorld((current) => ({ ...current, [worldId]: saves }))
    return saves
  }

  async function fetchWorldCard(worldId) {
    if (!worldId) return null
    const card = await api(`/world-cards/${worldId}`)
    setActiveWorldCard(card)
    return card
  }

  async function loadSave(worldId, slotId) {
    await fetchWorldCard(worldId)
    const save = await api(`/world-cards/${worldId}/saves/${slotId}`)
    await api(`/world-cards/${worldId}/saves/current`, {
      method: 'PUT',
      body: JSON.stringify({ slot_id: slotId }),
    })
    setActiveSave(save)
    setMode('game')
    return save
  }

  async function ensureSave(worldId, forceNew = false) {
    await fetchWorldCard(worldId)
    if (!forceNew) {
      const current = await api(`/world-cards/${worldId}/saves/current`).catch(() => null)
      if (current) return loadSave(worldId, current)
    }

    const firstEmpty = await api(`/world-cards/${worldId}/saves/first-empty`)
    if (!firstEmpty) throw new Error(t.noSlot)
    const save = await api(`/world-cards/${worldId}/saves`, {
      method: 'POST',
      body: JSON.stringify({
        slot_id: firstEmpty,
        name: forceNew
          ? `${t.newRun} ${new Date().toLocaleDateString(locale === 'en_us' ? 'en-US' : 'zh-CN')}`
          : t.autoSave,
        data: emptySaveData,
        set_current: true,
        touch_progress: true,
      }),
    })
    setActiveSave(save)
    await refreshSaves(worldId)
    setMode('game')
    return save
  }

  async function withStatus(action, successText) {
    setStatus('')
    try {
      const result = await action()
      if (successText) setStatus(successText)
      return result
    } catch (error) {
      setStatus(error.message)
      throw error
    }
  }

  async function login(credentials) {
    await withStatus(async () => {
      const nextUser = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      setUser(nextUser)
      await refreshWorlds()
      await refreshCustomProviders()
      await refreshUserConfig()
    }, t.loggedIn)
  }

  async function register(credentials) {
    await withStatus(async () => {
      const nextUser = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify(credentials),
      })
      setUser(nextUser)
      await refreshWorlds()
      await refreshCustomProviders()
      await refreshUserConfig()
    }, t.registered)
  }

  async function logout() {
    await withStatus(async () => {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setActiveSave(null)
      setActiveWorldCard(null)
      setCustomProviders([])
      setApiKeyStatuses([])
      setUsers([])
      setMode('launcher')
    }, t.loggedOut)
  }

  async function saveApiKey(event) {
    event.preventDefault()
    await withStatus(async () => {
      if (llmConfig.provider === 'custom' && !llmConfig.custom_provider_id) {
        throw new Error(t.customProviderPlaceholder)
      }
      await api('/config/keys', {
        method: 'POST',
        body: JSON.stringify({
          provider: llmConfig.provider,
          api_key: apiKey,
          custom_provider_id: llmConfig.custom_provider_id ? Number(llmConfig.custom_provider_id) : null,
        }),
      })
      await refreshUserConfig()
      setApiKey('')
    }, t.keySaved)
  }

  async function deleteApiKey(status) {
    await withStatus(async () => {
      const suffix = status.custom_provider_id ? `?custom_provider_id=${status.custom_provider_id}` : ''
      await api(`/config/keys/${status.provider}${suffix}`, { method: 'DELETE' })
      await refreshUserConfig()
    }, t.refreshed)
  }

  async function saveSystemConfig() {
    await withStatus(async () => {
      const updated = await api('/config/system', {
        method: 'PUT',
        body: JSON.stringify(systemConfig),
      })
      setSystemConfig(updated)
    }, t.refreshed)
  }

  async function updateUserRole(userId, role) {
    await withStatus(async () => {
      await api(`/config/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      })
      const nextUsers = await api('/config/users')
      setUsers(nextUsers)
    }, t.refreshed)
  }

  function editCustomProvider(provider) {
    setEditingCustomProviderId(provider.provider_id)
    setCustomProviderDraft({
      name: provider.name,
      provider: provider.provider,
      url: provider.url,
    })
  }

  function cancelCustomProviderEdit() {
    setEditingCustomProviderId(null)
    setCustomProviderDraft(defaultCustomProviderDraft)
  }

  async function submitCustomProvider(event) {
    event.preventDefault()
    await withStatus(async () => {
      const path = editingCustomProviderId ? `/config/providers/${editingCustomProviderId}` : '/config/providers'
      await api(path, {
        method: editingCustomProviderId ? 'PUT' : 'POST',
        body: JSON.stringify(customProviderDraft),
      })
      cancelCustomProviderEdit()
      const providers = await refreshCustomProviders()
      if (llmConfig.provider === 'custom' && !llmConfig.custom_provider_id && providers[0]) {
        setLlmConfig({ ...llmConfig, custom_provider_id: String(providers[0].provider_id) })
      }
    }, editingCustomProviderId ? t.providerUpdated : t.providerCreated)
  }

  async function deleteCustomProvider(providerId) {
    if (!window.confirm(t.confirmDeleteProvider)) return
    await withStatus(async () => {
      await api(`/config/providers/${providerId}`, { method: 'DELETE' })
      if (editingCustomProviderId === providerId) {
        cancelCustomProviderEdit()
      }
      if (String(llmConfig.custom_provider_id) === String(providerId)) {
        setLlmConfig({ ...llmConfig, custom_provider_id: '' })
      }
      await refreshCustomProviders()
    }, t.providerDeleted)
  }

  async function selectWorld(worldId) {
    setSelectedWorldId(worldId)
    setActiveWorldCard(null)
    await withStatus(async () => {
      await api(`/world-cards/active/${worldId}`, { method: 'PUT' })
      await refreshSaves(worldId)
    })
  }

  async function openWorld() {
    if (!selectedWorldId) return
    await withStatus(async () => {
      await ensureSave(selectedWorldId, false)
    })
  }

  async function newRun() {
    if (!selectedWorldId) return
    await withStatus(async () => {
      await ensureSave(selectedWorldId, true)
    })
  }

  async function sendTurn(text) {
    if (!selectedWorldId || !activeSave) return
    setPending(true)
    setStatus('')
    try {
      const response = await api('/chat/turn', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          world_card_id: selectedWorldId,
          save_slot_id: activeSave.id,
          history: activeSave.history || [],
          collected_data: {},
          llm: makeLlmPayload(llmConfig),
          autosave: true,
        }),
      })
      const nextSlot = response.save_slot_id || activeSave.id
      const nextSave = await api(`/world-cards/${selectedWorldId}/saves/${nextSlot}`)
      setActiveSave(nextSave)
      await refreshSaves(selectedWorldId)
    } catch (error) {
      setStatus(error.message)
    } finally {
      setPending(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialState() {
      try {
        const cards = await api(`/world-cards?locale=${encodeURIComponent(getContentLocale(locale))}`)
        if (cancelled) return
        setWorlds(cards)
        const providers = await api('/config/providers').catch(() => [])
        if (!cancelled) setCustomProviders(providers)
        const userConfig = await api('/config').catch(() => null)
        if (!cancelled && userConfig) {
          setUser(userConfig.user || null)
          setApiKeyStatuses(userConfig.api_keys || [])
          if (userConfig.config?.locale) setLocale(userConfig.config.locale)
        }
        const active = await api('/world-cards/active').catch(() => null)
        if (cancelled) return
        const nextId = (typeof active === 'string' ? active : active?.id) || cards[0]?.id || ''
        setSelectedWorldId(nextId)
        if (nextId) {
          const saves = await api(`/world-cards/${nextId}/saves`)
          if (!cancelled) setSavesByWorld((current) => ({ ...current, [nextId]: saves }))
        }
      } catch {
        if (!cancelled) setUser(null)
      }
    }

    loadInitialState()
    return () => {
      cancelled = true
    }
  }, [locale])

  if (mode === 'game') {
    return (
      <>
        <GameShell
          world={selectedWorld}
          locale={locale}
          t={t}
          onLocaleChange={changeLocale}
          save={activeSave}
          saves={selectedSaves}
          pending={pending}
          status={status}
          onSend={sendTurn}
          onChoose={sendTurn}
          onBack={() => setMode('launcher')}
          onLoadSave={(slotId) => withStatus(() => loadSave(selectedWorldId, slotId))}
          onNewRun={newRun}
          onOpenSettings={openSettings}
        />
        <SettingsModal
          open={settingsOpen}
          user={user}
          locale={locale}
          t={t}
          onClose={() => setSettingsOpen(false)}
          onLocaleChange={changeLocale}
          llmConfig={llmConfig}
          setLlmConfig={setLlmConfig}
          apiKey={apiKey}
          setApiKey={setApiKey}
          apiKeyStatuses={apiKeyStatuses}
          onSaveKey={saveApiKey}
          onDeleteKey={deleteApiKey}
          customProviders={customProviders}
          customProviderDraft={customProviderDraft}
          setCustomProviderDraft={setCustomProviderDraft}
          editingCustomProviderId={editingCustomProviderId}
          onEditCustomProvider={editCustomProvider}
          onCancelCustomProviderEdit={cancelCustomProviderEdit}
          onSubmitCustomProvider={submitCustomProvider}
          onDeleteCustomProvider={deleteCustomProvider}
          systemConfig={systemConfig}
          setSystemConfig={setSystemConfig}
          onSaveSystemConfig={saveSystemConfig}
          users={users}
          onUpdateUserRole={updateUserRole}
        />
      </>
    )
  }

  return (
    <>
      <Launcher
        user={user}
        locale={locale}
        t={t}
        onLocaleChange={changeLocale}
        worlds={worlds}
        saves={savesByWorld}
        selectedWorldId={selectedWorldId}
        status={status}
        onSelectWorld={selectWorld}
        onLogin={login}
        onRegister={register}
        onLogout={logout}
        onOpenWorld={openWorld}
        onNewRun={newRun}
        onRefresh={() => withStatus(refreshWorlds, t.refreshed)}
        onOpenSettings={openSettings}
      />
      <SettingsModal
        open={settingsOpen}
        user={user}
        locale={locale}
        t={t}
        onClose={() => setSettingsOpen(false)}
        onLocaleChange={changeLocale}
        llmConfig={llmConfig}
        setLlmConfig={setLlmConfig}
        apiKey={apiKey}
        setApiKey={setApiKey}
        apiKeyStatuses={apiKeyStatuses}
        onSaveKey={saveApiKey}
        onDeleteKey={deleteApiKey}
        customProviders={customProviders}
        customProviderDraft={customProviderDraft}
        setCustomProviderDraft={setCustomProviderDraft}
        editingCustomProviderId={editingCustomProviderId}
        onEditCustomProvider={editCustomProvider}
        onCancelCustomProviderEdit={cancelCustomProviderEdit}
        onSubmitCustomProvider={submitCustomProvider}
        onDeleteCustomProvider={deleteCustomProvider}
        systemConfig={systemConfig}
        setSystemConfig={setSystemConfig}
        onSaveSystemConfig={saveSystemConfig}
        users={users}
        onUpdateUserRole={updateUserRole}
      />
    </>
  )
}

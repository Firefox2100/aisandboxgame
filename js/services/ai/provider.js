/**
 * ai/provider.js
 * Provider 管理 + API 连接测试 + Adapter 工厂
 *
 * 通过 mixin 模式扩展 AIService.prototype。所有方法实现与原 class
 * AIService 中的版本完全一致，仅以独立 class 形式承载，文件末尾通过
 * _applyAIServiceMixin 合并到 AIService 上。
 *
 * 加载顺序：必须在 aiService.js 之后加载。
 */

class _AIServiceProviderMixin {
  // ========================================
  // 自定义 Provider 管理
  // ========================================

  getCustomProviders(options = {}) {
    return this._getCustomProvidersFromConfigSource(options);
  }

  addCustomProvider(provider) {
    if (!this.config.customProviders) this.config.customProviders = [];
    if (this.config.customProviders.length >= 5) {
      throw new Error('自定义服务商最多 5 个');
    }
    this.config.customProviders.push(provider);
    this.config = this._normalizeConfig(this.config);
    localStorage.setItem('ai_adventure_settings', JSON.stringify(this.config));
  }

  removeCustomProvider(id) {
    if (!this.config.customProviders) return;
    this.config.customProviders = this.config.customProviders.filter(p => p.id !== id);
    // 清理使用该 provider 的模块配置，回退到模块默认值
    if (this.config.modules) {
      for (const [key, mod] of Object.entries(this.config.modules)) {
        if (mod.provider === id) {
          const defaultConfig = this._buildDefaultModuleConfig(key);
          mod.provider = defaultConfig.provider;
          mod.model = defaultConfig.model;
          mod.temperature = defaultConfig.temperature;
          delete mod.priceIn;
          delete mod.priceOut;
        }
      }
    }
    // 清理 API Key
    if (this.config.providerApiKeys) {
      delete this.config.providerApiKeys[id];
    }
    this.config = this._normalizeConfig(this.config);
    localStorage.setItem('ai_adventure_settings', JSON.stringify(this.config));
  }

  // ========================================
  // API 连接测试
  // ========================================

  /**
   * 测试 API 连接是否可用
   * @param {string} providerId - 服务商 ID ('gemini', 'deepseek', 'openai', 'grok', 'anthropic', 'siliconflow', 'openrouter', 或自定义 ID)
   * @param {string} apiKey - API Key
   * @param {string} [model] - 模型名称（自定义 provider 必填）
   * @param {string} [baseUrl] - Base URL（仅自定义 provider 需要）
   * @returns {Promise<{ok: boolean, message: string, latency?: number}>}
   */
  async fetchCustomProviderModels(baseUrl, apiKey, protocol = 'openai') {
    if (protocol === 'anthropic') {
      // Anthropic 协议：base 末尾的 /v1 已被 _normalizeProviderBaseUrl 之外的输入留下，这里再做一次容错
      const trimmed = String(baseUrl || '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/v1$/, '');
      const url = trimmed + '/v1/models';
      const response = await fetch(url, {
        headers: {
          'x-api-key': window.apiKeySanitizer.sanitize(apiKey),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
      }
      const data = await response.json();
      // Anthropic /v1/models 返回 { data: [{ id, ... }] }，DeepSeek 兼容端不一定提供该接口
      return (data.data || []).map(m => m.id).filter(Boolean).sort();
    }
    const url = this._normalizeProviderBaseUrl(baseUrl) + '/models';
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + window.apiKeySanitizer.sanitize(apiKey) },
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    return (data.data || []).map(m => m.id).filter(Boolean).sort();
  }

  async testApiConnection(providerId, apiKey, model, baseUrl, protocol = 'openai') {
    if (!apiKey) {
      return { ok: false, message: '请先填入 API Key' };
    }

    const startTime = performance.now();

    try {
      if (providerId === 'gemini') {
        return await this._testGemini(apiKey, model, startTime);
      } else if (providerId === 'anthropic') {
        return await this._testAnthropic(apiKey, model, startTime);
      } else if (providerId === 'custom' && protocol === 'anthropic') {
        return await this._testAnthropicCustom(apiKey, model, baseUrl, startTime);
      } else {
        // OpenAI 兼容: openai / deepseek / grok / siliconflow / openrouter / custom (默认协议)
        return await this._testOpenAICompatible(providerId, apiKey, model, baseUrl, startTime);
      }
    } catch (e) {
      const latency = Math.round(performance.now() - startTime);
      return { ok: false, message: e.message || '连接失败', latency };
    }
  }

  async _testGemini(apiKey, model, startTime) {
    const testModel = model || 'gemini-3.1-flash-lite-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}?key=${window.apiKeySanitizer.sanitize(apiKey)}`;
    const response = await fetch(url);
    const latency = Math.round(performance.now() - startTime);

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        msg = err.error?.message || msg;
      } catch (_) {
        /* ignore */
      }
      return { ok: false, message: msg, latency };
    }

    const data = await response.json();
    const displayName = data.displayName || testModel;
    return { ok: true, message: `✓ ${displayName}`, latency }; /* ui-lint-allow */
  }

  async _testOpenAICompatible(providerId, apiKey, model, baseUrl, startTime) {
    let resolvedBaseUrl = '';
    const testModel = model || 'gpt-5.4';

    if (providerId === 'custom') {
      resolvedBaseUrl = this._normalizeProviderBaseUrl(baseUrl);
      if (!resolvedBaseUrl || !this._isValidHttpUrl(resolvedBaseUrl)) {
        return { ok: false, message: '请先填入有效的 Base URL' };
      }
    } else {
      resolvedBaseUrl = this.getProviderBaseUrl(providerId);
    }

    if (!resolvedBaseUrl) {
      return { ok: false, message: '无可用 Base URL' };
    }
    const url = resolvedBaseUrl + '/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + window.apiKeySanitizer.sanitize(apiKey),
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const latency = Math.round(performance.now() - startTime);

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        msg = err.error?.message || msg;
      } catch (_) {
        /* ignore */
      }
      return { ok: false, message: msg, latency };
    }

    const data = await response.json();
    const actualModel = data.model || testModel;
    return { ok: true, message: `✓ ${actualModel}`, latency }; /* ui-lint-allow */
  }

  async _testAnthropic(apiKey, model, startTime) {
    return this._testAnthropicAtUrl(
      apiKey,
      model || 'claude-sonnet-4-6-20250514',
      'https://api.anthropic.com/v1/messages',
      startTime
    );
  }

  async _testAnthropicCustom(apiKey, model, baseUrl, startTime) {
    if (!model) {
      return { ok: false, message: '请先填入模型名' };
    }
    const trimmed = String(baseUrl || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/v1$/, '');
    if (!trimmed || !this._isValidHttpUrl(trimmed)) {
      return { ok: false, message: '请先填入有效的 Base URL' };
    }
    return this._testAnthropicAtUrl(apiKey, model, trimmed + '/v1/messages', startTime);
  }

  async _testAnthropicAtUrl(apiKey, model, url, startTime) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': window.apiKeySanitizer.sanitize(apiKey),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    const latency = Math.round(performance.now() - startTime);

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        msg = err.error?.message || msg;
      } catch (_) {
        /* ignore */
      }
      return { ok: false, message: msg, latency };
    }

    const data = await response.json();
    const actualModel = data.model || model;
    return { ok: true, message: `✓ ${actualModel}`, latency }; /* ui-lint-allow */
  }

  getConfig() {
    return this.config;
  }

  // ========================================
  // Adapter 工厂方法
  // ========================================

  /**
   * 获取指定模块的 Adapter 实例
   * @param {string} module - 模块名称 ('react', 'sms', 'summary', 'chapter', 'design')
   * @returns {BaseAdapter}
   */
  _getAdapter(module = 'react', options = {}) {
    const config = this.getModuleConfig(module, options);
    const apiKey = this.getApiKeyForModule(module, options);

    switch (config.provider) {
      case 'gemini':
        return new GeminiAdapter(config, apiKey, this);
      case 'deepseek':
        return new OpenAIAdapter(config, apiKey, this, 'deepseek');
      case 'openai':
        return new OpenAIAdapter(config, apiKey, this, 'openai');
      case 'grok':
        return new OpenAIAdapter(config, apiKey, this, 'grok');
      case 'siliconflow':
        return new OpenAIAdapter(config, apiKey, this, 'siliconflow');
      case 'openrouter':
        return new OpenAIAdapter(config, apiKey, this, 'openrouter');
      case 'anthropic':
        return new AnthropicAdapter(config, apiKey, this);
      default:
        // 检查是否是自定义 provider
        const customProvider = this.getCustomProviders(options).find(p => p.id === config.provider);
        if (customProvider) {
          const customMaxOutputTokens =
            customProvider.maxOutputTokensEnabled === true &&
            Number.isFinite(customProvider.maxOutputTokens) &&
            customProvider.maxOutputTokens > 0
              ? customProvider.maxOutputTokens
              : null;
          if (customProvider.protocol === 'anthropic') {
            return new AnthropicAdapter(
              config,
              apiKey,
              this,
              'custom',
              customProvider.name,
              customProvider.baseUrl,
              customMaxOutputTokens
            );
          }
          return new OpenAIAdapter(
            config,
            apiKey,
            this,
            'custom',
            customProvider.name,
            customProvider.baseUrl,
            customMaxOutputTokens
          );
        }
        // 未知 provider（可能已被删除），回退到 gemini
        console.warn(`Unknown provider "${config.provider}", fallback to gemini`);
        return new GeminiAdapter(
          { ...config, provider: 'gemini' },
          this.getProviderApiKey('gemini', options),
          this
        );
    }
  }

  /**
   * 通用 Summary API 调用（根据 provider 自动路由）
   * @param {Array} messages - 消息数组
   * @param {string} systemPrompt - 系统提示词
   * @param {string} module - 模块名称
   * @param {Object} options - 可选参数 { onChunk?, abortSignal? }
   * @returns {Promise<string>}
   */
  async _callSummaryAPI(messages, systemPrompt, module, options = {}) {
    const provider = this.getProviderForModule(module, AI_REQUEST_SCOPED);
    if (provider === 'gemini') {
      return this.callGeminiSummary(messages, systemPrompt, module, options);
    }
    if (this._isAnthropicProtocolProvider(provider)) {
      return this.callAnthropicSummary(messages, systemPrompt, module, options);
    }
    return this.callOpenAISummary(messages, systemPrompt, module, options);
  }

  /**
   * 判断 provider 是否走 Anthropic 协议
   * 涵盖：内置 'anthropic' + 自定义服务商配置 protocol='anthropic'
   * @param {string} provider
   * @returns {boolean}
   */
  _isAnthropicProtocolProvider(provider) {
    if (provider === 'anthropic') return true;
    const cp = this.getCustomProviders(AI_REQUEST_SCOPED).find(p => p.id === provider);
    return cp?.protocol === 'anthropic';
  }

  /**
   * 解析模块对应的自定义服务商 maxOutputTokens 覆盖值。
   * 仅当自定义服务商打开了开关且填了正整数才返回该值，否则返回 null。
   * 用于 summary-sms.js 等直接构造 payload 的代码路径（绕过 adapter）。
   * @param {string} module
   * @returns {number|null}
   */
  _resolveCustomProviderMaxOutputTokens(module) {
    const provider = this.getProviderForModule(module, AI_REQUEST_SCOPED);
    const cp = this.getCustomProviders(AI_REQUEST_SCOPED).find(p => p.id === provider);
    if (!cp) return null;
    if (cp.maxOutputTokensEnabled !== true) return null;
    const value = Number(cp.maxOutputTokens);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.floor(value);
  }

  /**
   * 解析模块对应的 Anthropic Messages API URL
   * @param {string} module
   * @returns {string}
   */
  _resolveAnthropicMessagesUrl(module) {
    const provider = this.getProviderForModule(module, AI_REQUEST_SCOPED);
    if (provider === 'anthropic') return 'https://api.anthropic.com/v1/messages';
    const cp = this.getCustomProviders(AI_REQUEST_SCOPED).find(p => p.id === provider);
    if (cp && cp.protocol === 'anthropic') {
      const trimmed = String(cp.baseUrl || '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/v1$/, '');
      if (trimmed) return trimmed + '/v1/messages';
    }
    return 'https://api.anthropic.com/v1/messages';
  }

  // DeepSeek V4 hybrid 思考控制注入（用于绕过 OpenAIAdapter 直接构建 payload 的代码路径）。
  _applyDeepseekThinkingToPayload(payload, provider, _model, module) {
    if (provider !== 'deepseek') return;
    const level = this.getModuleThinking(module, AI_REQUEST_SCOPED);
    if (level === 'off') {
      payload.thinking = { type: 'disabled' };
    } else {
      payload.thinking = { type: 'enabled' };
      payload.reasoning_effort = level === 'max' ? 'max' : 'high';
    }
  }

  /**
   * 通用 SMS API 调用（根据 provider 自动路由）
   * @param {Array} messages - 消息数组
   * @param {Array} systemParts - 系统提示词数组
   * @returns {Promise<string>}
   */
  async _callSMSAPI(messages, systemParts) {
    const provider = this.getProviderForModule('sms', AI_REQUEST_SCOPED);
    if (provider === 'gemini') {
      return this.callGeminiSMS(messages, systemParts);
    }
    if (this._isAnthropicProtocolProvider(provider)) {
      return this.callAnthropicSMS(messages, systemParts);
    }
    return this.callOpenAISMS(messages, systemParts);
  }

  /**
   * DeepSeek 专用消息预处理：
   * - 仅在 react provider=deepseek 时生效
   * - 仅删除末尾连续 assistant 消息
   * - 不改中间历史，不自动补玩家输入
   */
  _sanitizeMessagesForDeepSeek(messages, provider) {
    const sourceMessages = Array.isArray(messages) ? messages : [];
    const originalCount = sourceMessages.length;
    const isDeepSeekReact = provider === 'deepseek';

    if (!isDeepSeekReact) {
      return {
        messages: sourceMessages,
        stats: {
          enabled: false,
          applied: false,
          originalCount,
          trimmedAssistantCount: 0,
          sanitizedCount: originalCount,
          hasUser: sourceMessages.some(msg => msg?.role === 'user'),
        },
      };
    }

    const sanitizedMessages = [...sourceMessages];
    let trimmedAssistantCount = 0;
    while (
      sanitizedMessages.length > 0 &&
      sanitizedMessages[sanitizedMessages.length - 1]?.role === 'assistant'
    ) {
      sanitizedMessages.pop();
      trimmedAssistantCount++;
    }

    return {
      messages: sanitizedMessages,
      stats: {
        enabled: true,
        applied: trimmedAssistantCount > 0,
        originalCount,
        trimmedAssistantCount,
        sanitizedCount: sanitizedMessages.length,
        hasUser: sanitizedMessages.some(msg => msg?.role === 'user'),
      },
    };
  }

}

_applyAIServiceMixin(_AIServiceProviderMixin);

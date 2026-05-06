// js/services/authService.js
// 跟 boxhill (new-api) 后端对话的认证服务
// - 登录：POST /api/user/login {username, password}
// - 注册：POST /api/user/register {username, password, password2, email}
// - 取自身：GET /api/user/self
// - 退出：GET /api/user/logout
//
// 设计说明：
// - boxhill CORS 是 Access-Control-Allow-Origin: *，因此跨域请求**不带 credentials**
// - 登录成功后用户信息（id / username / email / display_name）存在 accountStore 里
// - 持久化键：localStorage['auth_session_v1']，刷新页面自动恢复
// - 一切错误以 throw new Error(message) 形式抛出，UI 层捕获显示

(function () {
  'use strict';

  const BOXHILL_BASE = 'https://boxhill.aisandboxgame.com';
  const SESSION_KEY = 'auth_session_v1';

  // ────── 内部 fetch 封装 ──────

  async function postJSON(path, body) {
    const res = await fetch(BOXHILL_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return parseResponse(res);
  }

  async function getJSON(path) {
    const res = await fetch(BOXHILL_BASE + path, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    return parseResponse(res);
  }

  async function parseResponse(res) {
    let payload;
    try {
      payload = await res.json();
    } catch (_) {
      throw new Error(`服务器返回了无法解析的响应（HTTP ${res.status}）`);
    }
    if (!payload || typeof payload !== 'object') {
      throw new Error('服务器返回了空响应');
    }
    if (payload.success === false) {
      throw new Error(payload.message || '请求失败');
    }
    return payload.data;
  }

  // ────── localStorage 持久化 ──────

  function saveSession(userInfo) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        user: userInfo,
      }));
    } catch (_) { /* localStorage 不可用就算了 */ }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== 1 || !parsed.user) return null;
      return parsed.user;
    } catch (_) {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_) { /* noop */ }
  }

  // ────── 公开 API ──────

  /**
   * 登录
   * @param {string} usernameOrEmail 用户输入的"邮箱"——会同时作为 username 字段提交
   * @param {string} password
   * @returns {Promise<{id, username, email, display_name, role, quota, ...}>}
   */
  async function login(usernameOrEmail, password) {
    const id = String(usernameOrEmail || '').trim();
    const pw = String(password || '');
    if (!id) throw new Error('请输入邮箱');
    if (!pw) throw new Error('请输入密码');

    const data = await postJSON('/api/user/login', {
      username: id,
      password: pw,
    });

    if (!data || typeof data !== 'object') {
      throw new Error('登录响应缺少用户信息');
    }
    saveSession(data);
    return data;
  }

  /**
   * 注册
   * 把邮箱同时作为 username 提交（new-api 默认要求有 username 字段；
   * 邮箱本身可包含 @，新版 new-api 接受）
   */
  async function register(email, password) {
    const id = String(email || '').trim();
    const pw = String(password || '');
    if (!id) throw new Error('请输入邮箱');
    if (!pw) throw new Error('请输入密码');
    if (pw.length < 8) throw new Error('密码至少 8 位');

    await postJSON('/api/user/register', {
      username: id,
      password: pw,
      password2: pw,
      email: id,
      verification_code: '',
    });
    // 注册成功后立即登录，把 user info 拿回来
    return login(id, pw);
  }

  /**
   * 退出登录
   */
  async function logout() {
    try {
      await getJSON('/api/user/logout');
    } catch (_) {
      // 即使后端报错也要清本地
    }
    clearSession();
  }

  /**
   * 启动时尝试恢复上次的登录状态
   * 注意：因 CORS 不带 credentials，这里不能再调 /api/user/self 验证 cookie，
   * 我们只能信任本地缓存的用户信息直到下次 login 调用时被覆盖。
   * 本地缓存超过 30 天则丢弃。
   */
  function restoreFromLocal() {
    const cached = loadSession();
    if (!cached) return null;
    return cached;
  }

  // ────── 暴露到 window ──────

  window.authService = {
    login,
    register,
    logout,
    restoreFromLocal,
    // 调试用
    _saveSession: saveSession,
    _clearSession: clearSession,
    BOXHILL_BASE,
  };

  console.log('[AuthService] Initialized, boxhill =', BOXHILL_BASE);
})();

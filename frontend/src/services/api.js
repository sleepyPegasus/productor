const BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function getAuthHeadersOnly() {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// SSE streaming helper - shared by all SSE endpoints
// ---------------------------------------------------------------------------

/**
 * Generic SSE stream consumer. Sends a POST request with JSON body and
 * dispatches parsed events to the matching callback.
 *
 * @param {string} url - API endpoint
 * @param {object} body - JSON body to POST
 * @param {object} eventHandlers - Map of event type -> handler function.
 *   Values whose keys end with `:json` will have event.data JSON-parsed
 *   before being passed to the handler.
 * @param {string} errorMsg - Default error message when request fails
 * @returns {function} abort function
 */
function streamSSE(url, body, eventHandlers, errorMsg = '请求失败') {
  const controller = new AbortController();

  fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: body != null ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error(errorMsg);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              eventHandlers.done?.();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.replace(/^data:\s*/, '').trim();
              if (!trimmed) continue;
              try {
                const event = JSON.parse(trimmed);
                const handler = eventHandlers[event.type];
                if (handler) {
                  handler(event.data);
                }
              } catch {
                // skip malformed line
              }
            }
            read();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              eventHandlers.error?.(err.message);
            }
          });
      }
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        eventHandlers.error?.(err.message);
      }
    });

  return () => controller.abort();
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function apiLogin(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '登录失败' }));
    throw new Error(err.detail || '登录失败');
  }
  return res.json();
}

export async function apiSendCode(email, purpose = 'register') {
  const res = await fetch(`${BASE}/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '发送验证码失败' }));
    throw new Error(err.detail || '发送验证码失败');
  }
  return res.json();
}

export async function apiRegister(username, email, password, verificationCode) {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, verification_code: verificationCode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '注册失败' }));
    throw new Error(err.detail || '注册失败');
  }
  return res.json();
}

export async function apiChangePassword(oldPassword, newPassword) {
  const res = await fetch(`${BASE}/auth/change-password`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '修改密码失败' }));
    throw new Error(err.detail || '修改密码失败');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Users API
// ---------------------------------------------------------------------------

export async function fetchUsers() {
  const res = await fetch(`${BASE}/users`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取用户列表失败');
  return res.json();
}

export async function updateUser(userId, updates) {
  const res = await fetch(`${BASE}/users/${userId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '更新用户失败' }));
    throw new Error(err.detail || '更新用户失败');
  }
  return res.json();
}

export async function deleteUser(userId) {
  const res = await fetch(`${BASE}/users/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeadersOnly(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '删除用户失败' }));
    throw new Error(err.detail || '删除用户失败');
  }
  return res.json();
}

export async function resetUserPassword(userId) {
  const res = await fetch(`${BASE}/users/${userId}/reset-password`, {
    method: 'POST',
    headers: getAuthHeadersOnly(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '重置密码失败' }));
    throw new Error(err.detail || '重置密码失败');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Project Permissions API
// ---------------------------------------------------------------------------

export async function fetchProjectPermissions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/permissions`, {
    headers: getAuthHeadersOnly(),
  });
  if (!res.ok) throw new Error('获取权限列表失败');
  return res.json();
}

export async function setProjectPermission(projectId, userId, permission) {
  const res = await fetch(`${BASE}/projects/${projectId}/permissions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ user_id: userId, permission }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '设置权限失败' }));
    throw new Error(err.detail || '设置权限失败');
  }
  return res.json();
}

export async function removeProjectPermission(projectId, userId) {
  const res = await fetch(`${BASE}/projects/${projectId}/permissions/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeadersOnly(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '移除权限失败' }));
    throw new Error(err.detail || '移除权限失败');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Skills API
// ---------------------------------------------------------------------------

export async function fetchSkills(category = null, isEnabled = null) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (isEnabled !== null) params.set('is_enabled', isEnabled);
  const res = await fetch(`${BASE}/skills?${params.toString()}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取技能列表失败');
  return res.json();
}

export async function getSkill(skillId) {
  const res = await fetch(`${BASE}/skills/${skillId}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取技能详情失败');
  return res.json();
}

export async function createSkill(data) {
  const res = await fetch(`${BASE}/skills`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '创建技能失败' }));
    throw new Error(err.detail || '创建技能失败');
  }
  return res.json();
}

export async function updateSkill(skillId, updates) {
  const res = await fetch(`${BASE}/skills/${skillId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '更新技能失败' }));
    throw new Error(err.detail || '更新技能失败');
  }
  return res.json();
}

export async function deleteSkill(skillId) {
  const res = await fetch(`${BASE}/skills/${skillId}`, { method: 'DELETE', headers: getAuthHeadersOnly() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '删除技能失败' }));
    throw new Error(err.detail || '删除技能失败');
  }
  return res.json();
}

export async function resetSkill(skillId) {
  const res = await fetch(`${BASE}/skills/${skillId}/reset`, { method: 'POST', headers: getAuthHeadersOnly() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '重置技能失败' }));
    throw new Error(err.detail || '重置技能失败');
  }
  return res.json();
}

export async function duplicateSkill(skillId) {
  const res = await fetch(`${BASE}/skills/${skillId}/duplicate`, { method: 'POST', headers: getAuthHeadersOnly() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '复制技能失败' }));
    throw new Error(err.detail || '复制技能失败');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Projects API
// ---------------------------------------------------------------------------

export async function fetchProjects(category = 'active', search = '') {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}/projects?${params.toString()}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取项目列表失败');
  return res.json();
}

export async function createProject(name, description = '', chatModel = '', imageModel = '', comprehensiveModel = '', defaultImageResolution = '', defaultImageRatio = '') {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name,
      description,
      chat_model: chatModel,
      image_model: imageModel,
      comprehensive_model: comprehensiveModel,
      default_image_resolution: defaultImageResolution,
      default_image_ratio: defaultImageRatio,
    }),
  });
  if (!res.ok) throw new Error('创建项目失败');
  return res.json();
}

export async function archiveProject(id) {
  const res = await fetch(`${BASE}/projects/${id}/archive`, { method: 'POST', headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('归档失败');
  return res.json();
}

export async function restoreProject(id) {
  const res = await fetch(`${BASE}/projects/${id}/restore`, { method: 'POST', headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('恢复失败');
  return res.json();
}

export async function permanentlyDeleteProject(id) {
  const res = await fetch(`${BASE}/projects/${id}/permanent`, { method: 'DELETE', headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('永久删除失败');
  return res.json();
}

export async function getProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取项目失败');
  return res.json();
}

export async function updateProject(id, updates) {
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('更新项目失败');
  return res.json();
}

/**
 * Save design settings (globalStyle, selectedPresetId, pageImageConfigs) to DB.
 * @param {string} projectId
 * @param {object} settings - { selectedPresetId, globalStyle, pageImageConfigs }
 */
export async function saveDesignSettings(projectId, settings) {
  // Strip referenceImage data URLs from pageImageConfigs to avoid huge payloads
  const cleanConfigs = {}
  if (settings.pageImageConfigs) {
    for (const [pageId, config] of Object.entries(settings.pageImageConfigs)) {
      const { referenceImage, ...rest } = config || {}
      cleanConfigs[pageId] = rest
    }
  }
  const payload = {
    design_settings: JSON.stringify({
      selectedPresetId: settings.selectedPresetId || null,
      globalStyle: settings.globalStyle || {},
      pageImageConfigs: cleanConfigs,
    }),
  }
  return updateProject(projectId, payload)
}

export async function deleteProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE', headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('删除项目失败');
  return res.json();
}

export async function getChatHistory(id) {
  const res = await fetch(`${BASE}/projects/${id}/chat`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取聊天记录失败');
  return res.json();
}

export async function updateChatHistory(id, messages) {
  const res = await fetch(`${BASE}/projects/${id}/chat`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error('更新对话记录失败');
  return res.json();
}

export async function fetchModels() {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error('获取模型列表失败');
  return res.json();
}

// PRD content editing
export async function updatePrdContent(projectId, content) {
  const res = await fetch(`${BASE}/projects/${projectId}/prd-content`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('保存 PRD 内容失败');
  return res.json();
}

// PRD version history
export async function getPrdVersions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/prd-versions`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取版本历史失败');
  return res.json();
}

export async function getPrdVersionContent(projectId, version) {
  const res = await fetch(`${BASE}/projects/${projectId}/prd-versions/${version}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取版本内容失败');
  return res.json();
}

// Design version history
export async function getDesignVersions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/design-versions`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取设计版本历史失败');
  return res.json();
}

export async function getDesignVersionImages(projectId, version) {
  const res = await fetch(`${BASE}/projects/${projectId}/design-versions/${version}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取设计版本失败');
  return res.json();
}

// Comprehensive solution version history
export async function getComprehensiveVersions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/comprehensive-versions`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取综合方案版本历史失败');
  return res.json();
}

export async function getComprehensiveVersionContent(projectId, version) {
  const res = await fetch(`${BASE}/projects/${projectId}/comprehensive-versions/${version}`, { headers: getAuthHeadersOnly() });
  if (!res.ok) throw new Error('获取综合方案版本内容失败');
  return res.json();
}

export async function updateComprehensiveContent(projectId, content) {
  const res = await fetch(`${BASE}/projects/${projectId}/comprehensive-content`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('保存综合方案内容失败');
  return res.json();
}

/**
 * Start PRD generation via SSE stream.
 * @param {string} projectId
 * @param {string} message - user requirement
 * @param {object} callbacks - { onToken, onStatus, onRequirement, onPrdComplete, onDone, onError }
 * @returns {function} abort function
 */
export function generatePRD(projectId, message, callbacks) {
  return streamSSE(
    `${BASE}/projects/${projectId}/generate`,
    { message },
    {
      token: (data) => callbacks.onToken?.(data),
      status: (data) => callbacks.onStatus?.(data),
      requirement: (data) => callbacks.onRequirement?.(JSON.parse(data)),
      pages_plan: (data) => callbacks.onPagesPlan?.(JSON.parse(data)),
      images: (data) => callbacks.onImages?.(JSON.parse(data)),
      prd_complete: (data) => callbacks.onPrdComplete?.(data),
      done: () => callbacks.onDone?.(),
      error: (data) => callbacks.onError?.(data),
    },
    '生成请求失败',
  );
}

/**
 * Export PRD as Word document (.docx).
 * Triggers a file download in the browser.
 * @param {string} projectId
 * @param {string} projectName - used for the filename
 */
export async function exportPRDAsDocx(projectId, projectName = 'PRD') {
  const res = await fetch(`${BASE}/projects/${projectId}/export/docx`, { headers: getAuthHeadersOnly() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '导出失败' }));
    throw new Error(err.detail || '导出失败');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}_PRD.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Export comprehensive product plan (PRD + design images).
 * @param {string} projectId
 * @param {string} projectName
 * @param {string} format - 'docx', 'pdf', or 'pptx'
 */
export async function exportComprehensive(projectId, projectName = '产品方案', format = 'docx') {
  const res = await fetch(`${BASE}/projects/${projectId}/export/comprehensive`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ format }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: '导出失败' }));
    throw new Error(err.detail || '导出失败');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const extMap = { pptx: 'pptx', pdf: 'pdf', docx: 'docx' };
  const ext = extMap[format] || 'docx';
  a.download = `${projectName}_产品方案.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Start UI design image generation via SSE stream.
 * @param {string} projectId
 * @param {object} callbacks - { onImage, onStatus, onDone, onError }
 * @returns {function} abort function
 */
export function generateDesigns(projectId, callbacks, options = {}) {
  const body = {};
  if (options.globalStyle) body.global_style = options.globalStyle;

  return streamSSE(
    `${BASE}/projects/${projectId}/generate-designs`,
    body,
    {
      image: (data) => callbacks.onImage?.(JSON.parse(data)),
      status: (data) => callbacks.onStatus?.(data),
      done: (data) => callbacks.onDone?.(data),
      error: (data) => callbacks.onError?.(data),
    },
    '设计图生成请求失败',
  );
}

/**
 * Generate design image for a single page via SSE stream.
 * @param {string} projectId
 * @param {string} pageId
 * @param {object} callbacks - { onImage, onStatus, onDone, onError }
 * @param {object} [imageConfig] - { resolution, ratio }
 * @returns {function} abort function
 */
export function generateSinglePageDesign(projectId, pageId, callbacks, imageConfig = {}) {
  const body = { page_id: pageId };
  if (imageConfig.resolution) body.image_resolution = imageConfig.resolution;
  if (imageConfig.ratio) body.image_ratio = imageConfig.ratio;
  if (imageConfig.extraRequirements) body.image_extra_requirements = imageConfig.extraRequirements;
  if (imageConfig.referenceImage) body.reference_image = imageConfig.referenceImage;

  return streamSSE(
    `${BASE}/projects/${projectId}/generate-design-page`,
    body,
    {
      image: (data) => callbacks.onImage?.(JSON.parse(data)),
      status: (data) => callbacks.onStatus?.(data),
      done: (data) => callbacks.onDone?.(data),
      error: (data) => callbacks.onError?.(data),
    },
    '设计图生成请求失败',
  );
}

/**
 * Generate AI-integrated comprehensive product solution via SSE stream.
 * @param {string} projectId
 * @param {object} callbacks - { onToken, onStatus, onComprehensiveComplete, onComprehensiveReset, onDone, onError }
 * @returns {function} abort function
 */
export function generateComprehensive(projectId, callbacks) {
  return streamSSE(
    `${BASE}/projects/${projectId}/generate-comprehensive`,
    null,
    {
      token: (data) => callbacks.onToken?.(data),
      status: (data) => callbacks.onStatus?.(data),
      comprehensive_complete: (data) => callbacks.onComprehensiveComplete?.(data),
      comprehensive_reset: () => callbacks.onComprehensiveReset?.(),
      done: () => callbacks.onDone?.(),
      error: (data) => callbacks.onError?.(data),
    },
    '综合方案生成请求失败',
  );
}

/**
 * AI auto-fill page content fields via SSE stream.
 * @param {string} projectId
 * @param {string} message - user description
 * @param {object} currentFields - current form field values
 * @param {object} callbacks - { onToken, onFields, onDone, onError }
 * @returns {function} abort function
 */
export function aiFillPageContent(projectId, message, currentFields, callbacks) {
  return streamSSE(
    `${BASE}/projects/${projectId}/ai-fill-page-content`,
    { message, current_fields: currentFields },
    {
      token: (data) => callbacks.onToken?.(data),
      fields: (data) => callbacks.onFields?.(JSON.parse(data)),
      done: () => callbacks.onDone?.(),
      error: (data) => callbacks.onError?.(data),
    },
    'AI 填充请求失败',
  );
}

/**
 * Revise PRD via SSE stream.
 * Same callback shape as generatePRD.
 */
export function revisePRD(projectId, message, callbacks, version = null, section = null) {
  const body = { message };
  if (version !== null) body.version = version;
  if (section !== null) body.section = section;

  return streamSSE(
    `${BASE}/projects/${projectId}/revise`,
    body,
    {
      token: (data) => callbacks.onToken?.(data),
      status: (data) => callbacks.onStatus?.(data),
      prd_complete: (data) => callbacks.onPrdComplete?.(data),
      done: () => callbacks.onDone?.(),
      error: (data) => callbacks.onError?.(data),
    },
    '修改请求失败',
  );
}

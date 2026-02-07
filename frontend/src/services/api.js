const BASE = '/api';

export async function fetchProjects(category = 'active', search = '') {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}/projects?${params.toString()}`);
  if (!res.ok) throw new Error('获取项目列表失败');
  return res.json();
}

export async function createProject(name, description = '', chatModel = '', imageModel = '', comprehensiveModel = '', defaultImageResolution = '', defaultImageRatio = '') {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const res = await fetch(`${BASE}/projects/${id}/archive`, { method: 'POST' });
  if (!res.ok) throw new Error('归档失败');
  return res.json();
}

export async function restoreProject(id) {
  const res = await fetch(`${BASE}/projects/${id}/restore`, { method: 'POST' });
  if (!res.ok) throw new Error('恢复失败');
  return res.json();
}

export async function permanentlyDeleteProject(id) {
  const res = await fetch(`${BASE}/projects/${id}/permanent`, { method: 'DELETE' });
  if (!res.ok) throw new Error('永久删除失败');
  return res.json();
}

export async function getProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`);
  if (!res.ok) throw new Error('获取项目失败');
  return res.json();
}

export async function updateProject(id, updates) {
  const res = await fetch(`${BASE}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('更新项目失败');
  return res.json();
}

export async function deleteProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('删除项目失败');
  return res.json();
}

export async function getChatHistory(id) {
  const res = await fetch(`${BASE}/projects/${id}/chat`);
  if (!res.ok) throw new Error('获取聊天记录失败');
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('保存 PRD 内容失败');
  return res.json();
}

// PRD version history
export async function getPrdVersions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/prd-versions`);
  if (!res.ok) throw new Error('获取版本历史失败');
  return res.json();
}

export async function getPrdVersionContent(projectId, version) {
  const res = await fetch(`${BASE}/projects/${projectId}/prd-versions/${version}`);
  if (!res.ok) throw new Error('获取版本内容失败');
  return res.json();
}

// Design version history
export async function getDesignVersions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/design-versions`);
  if (!res.ok) throw new Error('获取设计版本历史失败');
  return res.json();
}

export async function getDesignVersionImages(projectId, version) {
  const res = await fetch(`${BASE}/projects/${projectId}/design-versions/${version}`);
  if (!res.ok) throw new Error('获取设计版本失败');
  return res.json();
}

// Comprehensive solution version history
export async function getComprehensiveVersions(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}/comprehensive-versions`);
  if (!res.ok) throw new Error('获取综合方案版本历史失败');
  return res.json();
}

export async function getComprehensiveVersionContent(projectId, version) {
  const res = await fetch(`${BASE}/projects/${projectId}/comprehensive-versions/${version}`);
  if (!res.ok) throw new Error('获取综合方案版本内容失败');
  return res.json();
}

export async function updateComprehensiveContent(projectId, content) {
  const res = await fetch(`${BASE}/projects/${projectId}/comprehensive-content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
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
  const controller = new AbortController();

  fetch(`${BASE}/projects/${projectId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error('生成请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              callbacks.onDone?.();
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
                switch (event.type) {
                  case 'token':
                    callbacks.onToken?.(event.data);
                    break;
                  case 'status':
                    callbacks.onStatus?.(event.data);
                    break;
                  case 'requirement':
                    callbacks.onRequirement?.(JSON.parse(event.data));
                    break;
                  case 'pages_plan':
                    callbacks.onPagesPlan?.(JSON.parse(event.data));
                    break;
                  case 'images':
                    callbacks.onImages?.(JSON.parse(event.data));
                    break;
                  case 'prd_complete':
                    callbacks.onPrdComplete?.(event.data);
                    break;
                  case 'done':
                    callbacks.onDone?.();
                    break;
                  case 'error':
                    callbacks.onError?.(event.data);
                    break;
                }
              } catch {
                // skip malformed line
              }
            }
            read();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              callbacks.onError?.(err.message);
            }
          });
      }
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    });

  return () => controller.abort();
}

/**
 * Export PRD as Word document (.docx).
 * Triggers a file download in the browser.
 * @param {string} projectId
 * @param {string} projectName - used for the filename
 */
export async function exportPRDAsDocx(projectId, projectName = 'PRD') {
  const res = await fetch(`${BASE}/projects/${projectId}/export/docx`);
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
    headers: { 'Content-Type': 'application/json' },
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
  const ext = format === 'pptx' ? 'pptx' : 'docx';
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
export function generateDesigns(projectId, callbacks) {
  const controller = new AbortController();

  fetch(`${BASE}/projects/${projectId}/generate-designs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error('设计图生成请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              callbacks.onDone?.();
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
                switch (event.type) {
                  case 'image':
                    callbacks.onImage?.(JSON.parse(event.data));
                    break;
                  case 'status':
                    callbacks.onStatus?.(event.data);
                    break;
                  case 'done':
                    callbacks.onDone?.(event.data);
                    break;
                  case 'error':
                    callbacks.onError?.(event.data);
                    break;
                }
              } catch {
                // skip malformed line
              }
            }
            read();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              callbacks.onError?.(err.message);
            }
          });
      }
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    });

  return () => controller.abort();
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
  const controller = new AbortController();

  const body = { page_id: pageId }
  if (imageConfig.resolution) body.image_resolution = imageConfig.resolution
  if (imageConfig.ratio) body.image_ratio = imageConfig.ratio
  if (imageConfig.extraRequirements) body.image_extra_requirements = imageConfig.extraRequirements

  fetch(`${BASE}/projects/${projectId}/generate-design-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error('设计图生成请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              callbacks.onDone?.();
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
                switch (event.type) {
                  case 'image':
                    callbacks.onImage?.(JSON.parse(event.data));
                    break;
                  case 'status':
                    callbacks.onStatus?.(event.data);
                    break;
                  case 'done':
                    callbacks.onDone?.(event.data);
                    break;
                  case 'error':
                    callbacks.onError?.(event.data);
                    break;
                }
              } catch {
                // skip malformed line
              }
            }
            read();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              callbacks.onError?.(err.message);
            }
          });
      }
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    });

  return () => controller.abort();
}

/**
 * Generate AI-integrated comprehensive product solution via SSE stream.
 * @param {string} projectId
 * @param {object} callbacks - { onToken, onStatus, onComprehensiveComplete, onComprehensiveReset, onDone, onError }
 * @returns {function} abort function
 */
export function generateComprehensive(projectId, callbacks) {
  const controller = new AbortController();

  fetch(`${BASE}/projects/${projectId}/generate-comprehensive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error('综合方案生成请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              callbacks.onDone?.();
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
                switch (event.type) {
                  case 'token':
                    callbacks.onToken?.(event.data);
                    break;
                  case 'status':
                    callbacks.onStatus?.(event.data);
                    break;
                  case 'comprehensive_complete':
                    callbacks.onComprehensiveComplete?.(event.data);
                    break;
                  case 'comprehensive_reset':
                    callbacks.onComprehensiveReset?.();
                    break;
                  case 'done':
                    callbacks.onDone?.();
                    break;
                  case 'error':
                    callbacks.onError?.(event.data);
                    break;
                }
              } catch {
                // skip malformed line
              }
            }
            read();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              callbacks.onError?.(err.message);
            }
          });
      }
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    });

  return () => controller.abort();
}

/**
 * Revise PRD via SSE stream.
 * Same callback shape as generatePRD.
 */
export function revisePRD(projectId, message, callbacks, version = null) {
  const controller = new AbortController();

  const body = { message }
  if (version !== null) body.version = version

  fetch(`${BASE}/projects/${projectId}/revise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error('修改请求失败');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              callbacks.onDone?.();
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
                switch (event.type) {
                  case 'token':
                    callbacks.onToken?.(event.data);
                    break;
                  case 'status':
                    callbacks.onStatus?.(event.data);
                    break;
                  case 'prd_complete':
                    callbacks.onPrdComplete?.(event.data);
                    break;
                  case 'done':
                    callbacks.onDone?.();
                    break;
                  case 'error':
                    callbacks.onError?.(event.data);
                    break;
                }
              } catch {
                // skip malformed line
              }
            }
            read();
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              callbacks.onError?.(err.message);
            }
          });
      }
      read();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        callbacks.onError?.(err.message);
      }
    });

  return () => controller.abort();
}

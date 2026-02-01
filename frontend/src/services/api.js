const BASE = '/api';

export async function fetchProjects() {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error('获取项目列表失败');
  return res.json();
}

export async function createProject(name, description = '') {
  const res = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error('创建项目失败');
  return res.json();
}

export async function getProject(id) {
  const res = await fetch(`${BASE}/projects/${id}`);
  if (!res.ok) throw new Error('获取项目失败');
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
 * Revise PRD via SSE stream.
 * Same callback shape as generatePRD.
 */
export function revisePRD(projectId, message, callbacks) {
  const controller = new AbortController();

  fetch(`${BASE}/projects/${projectId}/revise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
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

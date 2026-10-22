// js/api.js
'use strict';

const API_BASE = 'http://127.0.0.1:4000/api/v1';

/**
 * Hàm gửi request tới API backend với credentials: 'include'.
 * Tự động phân tích JSON và ném lỗi theo error.message của backend.
 *
 * @param {string} endpoint
 * @param {RequestInit} [options={}]
 * @returns {Promise<any>}
 */
async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
    credentials: 'include',
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.ok === false) {
    const errorMsg =
      (data.error && data.error.message) || data.message || `Lỗi ${response.status}: Yêu cầu thất bại`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.code = data.error && data.error.code;
    err.details = data.error && data.error.details;
    throw err;
  }

  return data.data !== undefined ? data.data : data;
}

window.API = {
  BASE_URL: API_BASE,
  request: apiRequest,
  get: (endpoint, headers) => apiRequest(endpoint, { method: 'GET', headers }),
  post: (endpoint, body, headers) => apiRequest(endpoint, { method: 'POST', body, headers }),
  put: (endpoint, body, headers) => apiRequest(endpoint, { method: 'PUT', body, headers }),
  patch: (endpoint, body, headers) => apiRequest(endpoint, { method: 'PATCH', body, headers }),
  delete: (endpoint, headers) => apiRequest(endpoint, { method: 'DELETE', headers }),
};

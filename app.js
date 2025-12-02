const VITE_API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  "http://localhost:8000";

const MAX_FILE_SIZE = (() => {
  const envBytes =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_MAX_FILE_SIZE_BYTES;
  const parsed = Number(envBytes);
  const bytes =
    Number.isFinite(parsed) && parsed > 0 ? parsed : 50 * 1024 * 1024;
  return bytes;
})();

function makeRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const state = {
  token: localStorage.getItem("token"),
  limit: 10,
  offset: 0,
  sort: "desc",
  total: 0,
};

const el = (id) => document.getElementById(id);

const signupTab = el("signup-tab");
const loginTab = el("login-tab");
const signupForm = el("signup-form");
const loginForm = el("login-form");
const authFeedback = el("auth-feedback");
const uploadFeedback = el("upload-feedback");
const listFeedback = el("list-feedback");
const authStatus = el("auth-status");
const authSub = el("auth-sub");
const logoutBtn = el("logout-btn");
const thumbnailCache = new Map();
let previewObjectUrl = null;
const uploadInput = el("file-input");
const uploadBtn = el("upload-btn");
let handledUnauthorized = false;

function apiFetch(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  headers["X-Request-ID"] = makeRequestId();
  const credentials = options.credentials ?? "include";
  return fetch(url, { ...options, headers, credentials }).then((res) => {
    if (res.status === 401 && state.token) {
      handleUnauthorized();
    }
    return res;
  });
}

function formatError(data, fallback = "Something went wrong.") {
  if (!data) return fallback;
  const detail = data.detail ?? data.message ?? data.error;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (item.msg) return item.msg;
        if (item.message) return item.message;
        return JSON.stringify(item);
      })
      .filter(Boolean);
    return parts.join("; ") || fallback;
  }
  if (typeof detail === "object" && detail.msg) return detail.msg;
  return JSON.stringify(detail);
}

function setAuthState(token) {
  state.token = token;
  const sub = getJwtSub(token);
  if (token) {
    localStorage.setItem("token", token);
    authStatus.textContent = "Authenticated";
    authSub.textContent = sub ? `User: ${sub}` : "";
    logoutBtn.hidden = false;
  } else {
    localStorage.removeItem("token");
    authStatus.textContent = "Not logged in";
    authSub.textContent = "";
    logoutBtn.hidden = true;
  }
  setUploadControlsEnabled(Boolean(token));
}

function switchTab(tab) {
  const isSignup = tab === "signup";
  signupTab.classList.toggle("active", isSignup);
  loginTab.classList.toggle("active", !isSignup);
  signupForm.classList.toggle("hidden", !isSignup);
  loginForm.classList.toggle("hidden", isSignup);
  authFeedback.textContent = "";
}

async function signup() {
  authFeedback.textContent = "";
  const email = el("signup-email").value.trim();
  const password = el("signup-password").value.trim();
  if (!email || !password) {
    authFeedback.textContent = "Email and password are required.";
    return;
  }
  const res = await apiFetch(`${VITE_API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.ok) {
    authFeedback.textContent = "Account created. You can log in now.";
    switchTab("login");
  } else {
    const data = await res.json().catch(() => ({}));
    authFeedback.textContent = formatError(data, "Sign up failed.");
  }
}

async function login() {
  authFeedback.textContent = "";
  const email = el("login-email").value.trim();
  const password = el("login-password").value.trim();
  if (!email || !password) {
    authFeedback.textContent = "Email and password are required.";
    return;
  }
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);
  const res = await apiFetch(`${VITE_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (res.ok) {
    const data = await res.json();
    setAuthState(data.access_token);
    authFeedback.textContent = "Logged in.";
    fetchFiles();
  } else {
    const data = await res.json().catch(() => ({}));
    authFeedback.textContent = formatError(data, "Login failed.");
  }
}

function humanSize(bytes = 0) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function getJwtSub(token) {
  if (!token) return "";
  const [, payload] = token.split(".");
  if (!payload) return "";
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    const data = JSON.parse(json);
    return data.sub ?? "";
  } catch {
    return "";
  }
}

function setMaxSizeLabel() {
  const elMax = el("max-file-size");
  if (elMax) elMax.textContent = humanSize(MAX_FILE_SIZE);
}

function authHeader() {
  if (!state.token) return {};
  return { Authorization: `Bearer ${state.token}` };
}

function showUploadProgress(percent, label = "") {
  el("upload-progress").value = percent;
  el("progress-label").textContent = label;
}

function ensureLoggedIn() {
  if (!state.token) {
    authFeedback.textContent = "Please log in first.";
    alert("Please log in before uploading.");
    return false;
  }
  return true;
}

async function logout() {
  try {
    await apiFetch(`${VITE_API_BASE}/auth/logout`, {
      method: "POST",
      headers: { ...authHeader() },
    });
  } catch {
    // Ignore logout errors; still clear client state.
  }
  setAuthState(null);
  renderRows([]);
}

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  el("preview").classList.add("hidden");
  el("preview-img").src = "";
  el("preview-label").textContent = "";
}

function clearThumbnails() {
  thumbnailCache.forEach((url) => {
    if (typeof url === "string" && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  });
  thumbnailCache.clear();
}

function setUploadControlsEnabled(enabled) {
  if (!uploadInput || !uploadBtn) return;
  uploadInput.disabled = !enabled;
  uploadBtn.disabled = !enabled;
}

function handleUnauthorized() {
  if (handledUnauthorized) return;
  handledUnauthorized = true;
  setAuthState(null);
  state.offset = 0;
  renderRows([]);
  clearPreview();
  authFeedback.textContent = "Session expired. Please log in.";
  listFeedback.textContent = "Session expired. Please log in.";
  uploadFeedback.textContent = "";
  setTimeout(() => {
    handledUnauthorized = false;
  }, 500);
}

function setThumbPlaceholder(cell) {
  cell.textContent = "";
  const placeholder = document.createElement("span");
  placeholder.className = "thumb-placeholder";
  placeholder.textContent = "FILE";
  cell.appendChild(placeholder);
}

async function uploadFile() {
  if (!ensureLoggedIn()) return;
  if (!uploadInput || !uploadInput.files.length) {
    uploadFeedback.textContent = "Choose a file first.";
    return;
  }
  const file = uploadInput.files[0];
  if (file.size > MAX_FILE_SIZE) {
    uploadFeedback.textContent = `File is too large. Max size is ${humanSize(
      MAX_FILE_SIZE
    )}.`;
    showUploadProgress(0, "");
    return;
  }
  showUploadProgress(0, "");
  uploadFeedback.textContent = "";

  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${VITE_API_BASE}/files/upload`);
  xhr.setRequestHeader("Authorization", `Bearer ${state.token}`);
  xhr.setRequestHeader("X-Request-ID", makeRequestId());
  xhr.withCredentials = true;

  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      showUploadProgress(percent, `${percent}%`);
    }
  });

  xhr.onload = () => {
    if (xhr.status === 401) {
      uploadFeedback.textContent = "Session expired. Please log in.";
      showUploadProgress(0, "");
      handleUnauthorized();
      return;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      uploadFeedback.textContent = "Upload complete.";
      uploadInput.value = "";
      showUploadProgress(0, "");
      fetchFiles();
    } else {
      const detail = formatError(
        JSON.parse(xhr.response || "{}"),
        "Upload failed."
      );
      uploadFeedback.textContent = detail;
    }
  };

  xhr.onerror = () => {
    uploadFeedback.textContent = "Upload failed.";
  };

  xhr.send(formData);
}

async function fetchFiles() {
  if (!state.token) {
    listFeedback.textContent = "Log in to see your files.";
    renderRows([]);
    return;
  }
  listFeedback.textContent = "Loading...";
  const url = `${VITE_API_BASE}/files?limit=${state.limit}&offset=${state.offset}&sort=${state.sort}`;
  const res = await apiFetch(url, { headers: { ...authHeader() } });
  if (res.ok) {
    const data = await res.json();
    state.total = data.total;
    renderRows(data.items || []);
    listFeedback.textContent = "";
  } else {
    const data = await res.json().catch(() => ({}));
    listFeedback.textContent = formatError(data, "Unable to load files.");
  }
}

function renderRows(items) {
  const tbody = el("file-rows");
  tbody.innerHTML = "";
  clearPreview();
  clearThumbnails();
  items.forEach((item) => {
    const tr = document.createElement("tr");

    const tdThumb = document.createElement("td");
    tdThumb.className = "thumb-cell";
    if (item.thumbnail_name) {
      tdThumb.textContent = "Loading...";
      fetchThumbnail(item, tdThumb);
    } else {
      setThumbPlaceholder(tdThumb);
    }
    tr.appendChild(tdThumb);

    const tdName = document.createElement("td");
    tdName.textContent = item.display_name;
    tr.appendChild(tdName);

    const tdSize = document.createElement("td");
    tdSize.textContent = humanSize(item.size);
    tr.appendChild(tdSize);

    const tdType = document.createElement("td");
    tdType.textContent = item.content_type || "Unknown";
    tr.appendChild(tdType);

    const tdCreated = document.createElement("td");
    tdCreated.textContent = new Date(item.created_at).toLocaleString();
    tr.appendChild(tdCreated);

    const tdActions = document.createElement("td");
    tdActions.className = "actions";
    tdActions.innerHTML = `
        <button class="ghost" data-action="rename">Edit</button>
        <button class="ghost" data-action="download">Download</button>
        <button class="ghost" data-action="delete">Delete</button>
      `;
    tr.appendChild(tdActions);
    tr.addEventListener("click", (e) => onRowClick(e, item));
    tbody.appendChild(tr);
  });
  const currentPage = Math.floor(state.offset / state.limit) + 1;
  const totalPages = Math.max(1, Math.ceil((state.total || 0) / state.limit));
  el("page-info").textContent = `Page ${currentPage} of ${totalPages}`;
}

async function fetchThumbnail(item, cell) {
  try {
    const res = await apiFetch(`${VITE_API_BASE}/files/${item.id}/thumbnail`, {
      headers: { ...authHeader() },
    });
    if (!res.ok) {
      setThumbPlaceholder(cell);
      return;
    }
    const data = await res.json();
    if (!data || !data.url) {
      setThumbPlaceholder(cell);
      return;
    }
    const url = data.url;
    thumbnailCache.set(item.id, url);
    const img = document.createElement("img");
    img.src = url;
    img.alt = `Thumbnail ${item.display_name}`;
    img.className = "thumb-img";
    cell.textContent = "";
    cell.appendChild(img);
  } catch {
    setThumbPlaceholder(cell);
  }
}

async function onRowClick(event, item) {
  const action = event.target.dataset.action;
  event.stopPropagation();
  if (action === "rename") {
    return renameFile(item);
  }
  if (action === "delete") {
    return deleteFile(item);
  }
  if (action === "download") {
    return downloadFile(item);
  }
  if (item.content_type && item.content_type.startsWith("image/")) {
    previewFile(item);
  } else {
    clearPreview();
  }
}

async function renameFile(item) {
  const newName = prompt("New display name", item.display_name);
  if (!newName || newName === item.display_name) return;
  const res = await apiFetch(`${VITE_API_BASE}/files/${item.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ display_name: newName }),
  });
  if (res.ok) {
    fetchFiles();
  } else {
    const data = await res.json().catch(() => ({}));
    alert(formatError(data, "Rename failed"));
  }
}

async function deleteFile(item) {
  if (!confirm(`Delete ${item.display_name}?`)) return;
  const res = await apiFetch(`${VITE_API_BASE}/files/${item.id}`, {
    method: "DELETE",
    headers: { ...authHeader() },
  });
  if (res.status === 204) {
    fetchFiles();
  } else {
    const data = await res.json().catch(() => ({}));
    alert(formatError(data, "Delete failed"));
  }
}

async function downloadFile(item) {
  const res = await apiFetch(`${VITE_API_BASE}/files/${item.id}/download`, {
    headers: { ...authHeader() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(formatError(data, "Download failed"));
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!data || !data.url) {
    alert("Download URL is missing.");
    return;
  }
  const { url, filename, display_name: displayName } = data;
  const suggestedName = displayName || item.display_name || filename || "download";
  try {
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      const errText = await fileRes.text();
      alert(`Download failed. ${errText || ""}`);
      return;
    }
    const blob = await fileRes.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = suggestedName;
    a.rel = "noreferrer noopener";
    a.target = "_blank";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    alert(`Download failed. ${err?.message || ""}`);
  }
}

async function previewFile(item) {
  const res = await apiFetch(`${VITE_API_BASE}/files/${item.id}/download`, {
    headers: { ...authHeader() },
  });
  if (!res.ok) {
    clearPreview();
    return;
  }
  const contentType = res.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({}));
      if (!data || !data.url) {
        clearPreview();
        return;
      }
      const fileRes = await fetch(data.url);
      if (!fileRes.ok) {
        clearPreview();
        return;
      }
      const blob = await fileRes.blob();
      previewObjectUrl = URL.createObjectURL(blob);
    } else {
      const blob = await res.blob();
      previewObjectUrl = URL.createObjectURL(blob);
    }
    el("preview-img").src = previewObjectUrl;
    el("preview").classList.remove("hidden");
    el("preview-label").textContent = item.display_name;
  } catch {
    clearPreview();
  }
}

function nextPage() {
  const nextOffset = state.offset + state.limit;
  if (nextOffset >= state.total) return;
  state.offset = nextOffset;
  fetchFiles();
}

function prevPage() {
  state.offset = Math.max(0, state.offset - state.limit);
  fetchFiles();
}

function bindEvents() {
  signupTab.addEventListener("click", () => switchTab("signup"));
  loginTab.addEventListener("click", () => switchTab("login"));
  el("signup-btn").addEventListener("click", signup);
  el("login-btn").addEventListener("click", login);
  uploadBtn.addEventListener("click", uploadFile);
  el("refresh-btn").addEventListener("click", fetchFiles);
  logoutBtn.addEventListener("click", logout);
  el("limit-select").addEventListener("change", (e) => {
    state.limit = Number(e.target.value);
    state.offset = 0;
    fetchFiles();
  });
  el("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    fetchFiles();
  });
  el("next-page").addEventListener("click", nextPage);
  el("prev-page").addEventListener("click", prevPage);
}

function init() {
  bindEvents();
  setMaxSizeLabel();
  setAuthState(state.token);
  if (state.token) {
    fetchFiles();
  }
}

init();

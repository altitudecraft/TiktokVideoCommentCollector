# Manifest 配置问题

> Chrome 扩展清单配置、权限声明、CSP 策略、扩展生命周期相关的 Bug 记录。

<!-- 按时间倒序记录，最新的在最前面 -->
<!-- 记录格式见 README.md -->

### [2026-02-28] optional_host_permissions 需配合用户授权
- **严重级别**: 🟡 中等
- **出现次数**: 1
- **问题**: 用户自定义 API 地址后，`fetch` 请求被 Chrome 拦截（跨域权限不足）
- **根因**: `manifest.json` 的 `host_permissions` 只包含默认 API 地址。自定义地址需要 `optional_host_permissions` + Popup 端 `chrome.permissions.request()`
- **解决**: 添加 `"optional_host_permissions": ["http://*/*", "https://*/*"]`；SW 检测到权限不足时返回 `permission_needed`，Popup 调用 `chrome.permissions.request()`
- **预防**: 涉及用户可配置的外部 URL 时，必须使用 optional_host_permissions + 运行时权限请求
- **关键词**: optional_host_permissions, permissions.request, 跨域, 自定义API

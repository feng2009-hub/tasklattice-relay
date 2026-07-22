# 镜像发布与 Helm 部署

## 镜像盘点

TaskLattice 需要发布 **5 个第一方镜像**：

| 镜像 | 构建入口 | 作用 | 发布架构 |
| --- | --- | --- | --- |
| `tasklattice-control` | `infra/docker/Dockerfile`, target `control` | Web UI、REST/WebSocket API、SQLite 控制数据 | amd64、arm64 |
| `tasklattice-openshell-runner` | `infra/docker/Dockerfile`, target `runner` | 调用 OpenShell 创建、观察、连接和销毁 Sandbox | amd64、arm64 |
| `tasklattice-litellm` | `infra/docker/Dockerfile.litellm` | 模型网关、虚拟 Key、费用归集 | amd64、arm64 |
| `tasklattice-nemoclaw-sandbox` | `scripts/build-nemoclaw-sandbox.sh` (`openclaw`) + `Dockerfile.nemoclaw-openclaw` | OpenClaw Agent 的动态 Sandbox | amd64、arm64 |
| `tasklattice-nemoclaw-hermes-sandbox` | 同一脚本 (`hermes`) + `Dockerfile.nemoclaw-hermes` | Hermes Agent 的动态 Sandbox | amd64、arm64 |

完整部署还会拉取 **4 个固定的第三方镜像**：PostgreSQL、OpenShell
gateway、OpenShell supervisor 和 Agent Sandbox controller。因此，当
OpenClaw 与 Hermes 实例都至少启动一个时，整套系统共有 **9 个唯一镜像**。
刚安装而尚未创建 Agent 实例时，两个 Agent 镜像和 supervisor 还不会形成
常驻 Pod，但 runner 已经保存了它们的 released image 引用。

## 构建关系

`control` 与 `runner` 共享 Node 22 依赖和 TypeScript 编译阶段；runner 额外
下载固定版本的 OpenShell CLI。LiteLLM 以固定的 database variant 为基础，
提前执行 UI 初始化和 Prisma generate，使运行容器可以保持非 root。

两个 Agent 镜像都从固定 NemoClaw commit 构建，再经过仓库内各自的薄包装层
生成最终发布镜像。OpenClaw 在上游构建前应用仓库内的 no-proxy 补丁，并由
`Dockerfile.nemoclaw-openclaw` 提供后续 TaskLattice 定制边界；Hermes 在上游
镜像不可匿名拉取时先构建固定的 base fallback，再用
`Dockerfile.nemoclaw-hermes` 对齐 OpenShell 要求的 UID/GID 并加入配置
bootstrap。发布工作流按 amd64/arm64 独立构建这两条链，最后合并为
multi-arch manifest。

每条 Agent 构建链遵循同一个分层约定：

```text
固定上游源码 + 固定 base digest
  -> tasklattice-nemoclaw-<agent>-upstream:<revision>（仅构建中使用）
  -> infra/docker/Dockerfile.nemoclaw-<agent>
  -> ghcr.io/<owner>/tasklattice-nemoclaw-<agent>-sandbox:<release>
```

上游 Dockerfile 不复制到本仓库，以免与固定 NemoClaw revision 的实现漂移；
TaskLattice 自有的启动脚本、配置 bootstrap、身份适配和运行时扩展只进入包装层。
新增 Agent runtime 时应沿用独立包装 Dockerfile，而不是把平台定制继续堆入
`build-nemoclaw-sandbox.sh`。OpenClaw 为兼容现有部署保留历史发布名
`tasklattice-nemoclaw-sandbox`，其内部 upstream 标签仍显式包含 `openclaw`。

## GitHub Actions Release

`.github/workflows/release.yml` 只响应语义化 tag，例如：

```bash
git tag v0.3.0
git push origin v0.3.0
```

流程会先运行测试、类型检查和 Helm render，再并行构建 5 个 GHCR 镜像。
每个镜像发布 `X.Y.Z`、`sha-<12位提交>`，稳定版本同时更新 `latest`；预发布
tag（如 `v0.3.0-rc.1`）不会更新 `latest`。成功后它会：

1. 发布 `oci://ghcr.io/<owner>/charts/tasklattice:X.Y.Z`；
2. 创建 GitHub Release；
3. 将自包含的 `tasklattice-X.Y.Z.tgz` 附到 Release。

GHCR package 必须是 public，或者目标集群必须配置 pull secret。首次在仓库
发布 package 后，请在 GitHub package settings 中确认 5 个 image package 和
chart package 的可见性符合部署环境。

## 从 GitHub Release 一键部署

```bash
VERSION="<release-version>"
curl -fLO "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

也可以直接从 GHCR OCI Chart 安装：

```bash
VERSION="<release-version>"
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

默认 values 与当前本地验证路径一致：control 和 OpenShell 使用
`LoadBalancer`，本地登录为 `admin/admin`，OpenShell 使用集群内 plaintext
且允许未认证客户端。这保证可信本地集群可直接启动，但不适合暴露到共享或公网
环境。生产部署至少需要用私有 values 文件替换全部 `secrets.*`，并为 OpenShell
和入口配置 TLS/OIDC。若集群已经安装 Agent Sandbox controller，设置
`agentSandbox.enabled=false`，避免重复管理集群级 CRD/controller。

私有 GHCR 镜像需要先创建 pull secret，并同时传给 TaskLattice Pod 与动态
Sandbox：

```yaml
global:
  imagePullSecrets:
    - name: ghcr-pull
openshell:
  server:
    sandboxImagePullSecrets:
      - ghcr-pull
```

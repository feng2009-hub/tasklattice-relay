# 日常维护手册

通过小而可重复的检查，让控制平面、运行时服务、存储和证据链路保持可观察、可恢复。

## 每日健康检查

1. **确认工作负载与存储状态。** 所有预期的 Deployment 和 StatefulSet 都应可用。应尽早处理频繁重启、Pending Pod 和 PVC 用量增长。

   ~~~shell
   kubectl -n <namespace> get pods,services,pvc
   kubectl -n <namespace> get deploy,statefulset
   ~~~

2. **检查近期集群事件。** 关注调度、存储卷、探针、镜像拉取、准入和证书错误，并与发布或配置变更关联。

   ~~~shell
   kubectl -n <namespace> get events --sort-by=.lastTimestamp
   ~~~

3. **检查控制平面和运行时信号。** 检查 Control、Runner、LiteLLM、OpenShell 和 Agent Sandbox controller 是否持续报错。使用有限时间范围以免掩盖第一个错误。

   ~~~shell
   kubectl -n <namespace> logs deployment/<release>-control --since=1h
   kubectl -n <namespace> logs deployment/<release>-runner --since=1h
   kubectl -n <namespace> logs deployment/<release>-litellm --since=1h
   ~~~

4. **验证用户可见路径。** 使用非应急账户登录，打开项目，确认概览数据正常加载，并在不修改生产状态的情况下验证一个已知健康的智能体。

## 计划维护

- **备份并演练恢复。** 涉及数据库结构的升级前先备份 PostgreSQL。备份属于敏感数据，应在隔离环境中定期恢复以证明可恢复性。

  ~~~shell
  kubectl -n <namespace> exec statefulset/<release>-postgresql -- \
    pg_dump -U <db-user> -d <database> --format=custom > tali-backup.dump
  ~~~

- **检查配置与密钥。** 部署的 `control.toml` 和私有 values 文件不能进入源码仓库。通过批准流程轮换签名、数据库、网关、提供商、SMTP、镜像仓库和 OIDC 凭证。
- **使用发布门禁完成升级。** 阅读发布说明、渲染 Chart、保留私有配置、备份数据库，并使用 Helm 等待超时。接受变更前逐一验证工作负载。

  ~~~shell
  helm upgrade --install <release> <chart> \
    -n <namespace> -f <private-values.yaml> --wait --timeout 30m
  kubectl -n <namespace> rollout status deployment/<release>-control --timeout=300s
  ~~~

- **保留运维记录。** 记录操作人、原因、版本、配置变化、开始和结束时间、验证证据，以及回滚或恢复决定。

> **共享环境不能使用开发默认值。** 替换所有默认密钥，正确配置 TLS 和身份系统，保护镜像仓库凭证，并由集群负责人确认 Agent Sandbox 的安全模型。

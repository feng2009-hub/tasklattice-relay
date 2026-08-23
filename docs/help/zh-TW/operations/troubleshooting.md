# 疑難排解手冊

找出第一個失敗邊界、保留證據，並在原因尚未確定時避免擴大為破壞性變更。

## 排查順序

1. **明確界定範圍與近期變更。** 記錄受影響的專案、角色、Agent、開始時間、最後正常時間，以及近期發布或設定變更，判斷問題屬於 UI、API、資料庫、閘道或執行階段。
2. **重新啟動前先檢查狀態。** 先儲存 Pod、發布狀態、事件與日誌。重新啟動可能清除找出原因所需的時間與狀態資訊。

   ~~~shell
   kubectl -n <namespace> get pods -o wide
   kubectl -n <namespace> get events --sort-by=.lastTimestamp
   helm -n <namespace> status <release>
   ~~~

3. **沿相依鏈排查。** Control 相依於 PostgreSQL 與身分設定；Agent 操作會繼續經過 Runner、OpenShell、Agent Sandbox controller、沙箱映像檔、LiteLLM 與上游模型提供者。
4. **復原最小失敗邊界。** 優先修正失效的 Secret、路由、Pod、提供者或執行個體，避免重新啟動整個命名空間。最後同時驗證技術健康狀態與原始使用者路徑。

## 常見症狀

### 無法存取控制台

檢查 Control 發布、Service endpoints、Route/Ingress、憑證、`control.toml` 掛載與 PostgreSQL 連線。Pod 健康但沒有 endpoint 時，服務仍無法使用。

~~~shell
kubectl -n <namespace> get deploy/<release>-control svc/<release>-control endpoints/<release>-control
kubectl -n <namespace> logs deployment/<release>-control --since=30m
~~~

### 登入失敗

檢查資料庫連線與使用者狀態。OIDC 情境還需要檢查 issuer discovery、回呼網址、用戶端憑證、憑證信任與時鐘偏差。請先保留驗證錯誤，再考慮重設帳戶。

### 執行個體長時間停留在建立中

檢查執行個體建立日誌、Runner、OpenShell gateway、sandbox 資源、controller 事件、PVC、排程與映像檔拉取 Secret。重試前先確認預期狀態。

~~~shell
kubectl -n <namespace> get sandboxes,pods,pvc
kubectl -n <namespace> logs deployment/<release>-runner --since=30m
kubectl -n <namespace> logs deployment/agent-sandbox-controller --since=30m
~~~

### 模型請求失敗

檢查 LiteLLM 健康狀態與日誌、路由狀態、提供者模型名稱、網路、配額與憑證中繼資料。請勿將提供者金鑰貼入日誌或問題單。

~~~shell
kubectl -n <namespace> logs deployment/<release>-litellm --since=30m
~~~

### 用量、成本或稽核資料延遲

確認請求完成狀態、時鐘與時區、收集服務、資料庫寫入、所選時間範圍與歸屬識別碼。必須區分資料缺失與實際零值。

## 升級所需證據

- **應包含：** 版本、命名空間、含時區的時間戳記、受影響的資源 ID、已遮罩的錯誤、Pod 狀態、相關事件、有限範圍的日誌與已嘗試步驟。
- **不得包含：** 密碼、工作階段權杖、提供者金鑰、完整的 `control.toml`、私有 values、原始個人資料，或完整的提示與模型回應；除非已核准的安全通道明確要求。

> **資料庫回復不是一般的應用程式回復。** 請勿因應用程式發布失敗就降級或還原 PostgreSQL。應停止操作、保留證據、檢查移轉相容性，並在明確的維護時段內執行已驗證的復原計畫。

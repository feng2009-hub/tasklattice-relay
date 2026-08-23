# 日常維護手冊

透過小型且可重複的檢查，讓控制平面、執行階段服務、儲存空間與證據鏈路維持可觀測且可復原。

## 每日健康檢查

1. **確認工作負載與儲存狀態。** 所有預期的 Deployment 與 StatefulSet 都應可用。應及早處理頻繁重新啟動、Pending Pod 與 PVC 用量持續增加等問題。

   ~~~shell
   kubectl -n <namespace> get pods,services,pvc
   kubectl -n <namespace> get deploy,statefulset
   ~~~

2. **檢查近期叢集事件。** 留意排程、儲存磁碟區、探查、映像檔拉取、准入與憑證錯誤，並將它們與發布或設定變更關聯。

   ~~~shell
   kubectl -n <namespace> get events --sort-by=.lastTimestamp
   ~~~

3. **檢查控制平面與執行階段訊號。** 檢查 Control、Runner、LiteLLM、OpenShell 與 Agent Sandbox controller 是否持續回報錯誤。請使用有限的時間範圍，以免掩蓋第一個錯誤。

   ~~~shell
   kubectl -n <namespace> logs deployment/<release>-control --since=1h
   kubectl -n <namespace> logs deployment/<release>-runner --since=1h
   kubectl -n <namespace> logs deployment/<release>-litellm --since=1h
   ~~~

4. **驗證使用者可見路徑。** 使用非緊急帳戶登入、開啟專案、確認概覽資料正常載入，並在不修改正式環境狀態的情況下驗證一個已知健康的 Agent。

## 計畫性維護

- **備份並演練復原。** 涉及資料庫結構的升級前，先備份 PostgreSQL。備份屬於敏感資料，應在隔離環境中定期還原，以證明其可復原性。

  ~~~shell
  kubectl -n <namespace> exec statefulset/<release>-postgresql -- \
    pg_dump -U <db-user> -d <database> --format=custom > tali-backup.dump
  ~~~

- **檢查設定與金鑰。** 部署使用的 `control.toml` 與私有 values 檔案不可進入原始碼儲存庫。透過核准流程輪替簽章、資料庫、閘道、提供者、SMTP、映像檔儲存庫與 OIDC 憑證。
- **使用發布閘道完成升級。** 閱讀發布說明、轉譯 Chart、保留私有設定、備份資料庫，並為 Helm 設定等待逾時。接受變更前，逐一驗證工作負載。

  ~~~shell
  helm upgrade --install <release> <chart> \
    -n <namespace> -f <private-values.yaml> --wait --timeout 10m
  kubectl -n <namespace> rollout status deployment/<release>-control --timeout=300s
  ~~~

- **保留維運記錄。** 記錄操作人員、原因、版本、設定變化、開始與結束時間、驗證證據，以及復原或回復決策。

> **共用環境不可使用開發預設值。** 請替換所有預設金鑰、正確設定 TLS 與身分系統、保護映像檔儲存庫憑證，並由叢集負責人確認 Agent Sandbox 的安全模型。

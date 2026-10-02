# ALBメンテナンス設定自動化 提案書（概要・コード例付き）

## 1. 結論

現在AWSマネジメントコンソールで行っている約30ステップの作業を、**GitHubで設定ファイルを1つ作成し、Pull Requestを承認する運用**へ変更します。

作業者が入力するのは主に次の内容だけです。

- 対象環境
- メンテナンス開始・終了日時
- 対象パス
- メンテナンス名称
- ALBルールの優先度
- 確認用URL

ALBのルールARN、EventBridgeのスケジュール名、説明文、API実行用JSON、メンテナンスHTMLなどは自動生成します。

```text name=operation-flow.txt
作業者が設定ファイルを作成
        ↓
GitHubでPull Requestを作成
        ↓
TerraformがAWSの変更予定を表示
        ↓
責任者が内容を承認
        ↓
AWSへ自動設定
        ↓
開始時刻：ModifyRuleでメンテナンス画面へ切り替え
        ↓
終了時刻：DeleteRuleでメンテナンス用ルールを削除
```

---

## 2. どのくらい短縮できるか

| 作業 | 現在 | 導入後 |
|---|---:|---:|
| AWS設定作業 | 約30～60分 | 約5～15分 |
| AWSコンソール操作 | 約30ステップ | 原則0 |
| 日時の入力 | 複数画面 | 1か所 |
| ARNのコピー | 必要 | 不要 |
| JSON・HTML作成 | 手作業 | 自動 |
| 設定確認 | AWS画面で目視 | PR上で確認 |
| 作業時間削減見込み | ― | **約70～90%** |

※上記は概算です。正確な削減率は、現状作業の実測時間とPoC後の作業時間を比較して確定します。承認待ち時間は含みません。

---

# 3. 作業者が実際に入力する内容

作業者は、メンテナンスごとにYAMLファイルを1つ作成します。

例えば、現在の`family-setting`メンテナンスは次のように記載します。

```yaml name=maintenances/active/family-setting-20260826-0200.yaml
# どの環境で実施するか
environment: prd

# メンテナンスを識別する名前
maintenance_id: family-setting
maintenance_name: BOメンテナンス_20260826_0200-0800

# 開始・終了日時
start_at: "2026-08-26T02:00:00+09:00"
end_at: "2026-08-26T08:00:00+09:00"

# ALBリスナールールの優先度
priority: 55

# メンテナンス対象
paths:
  - /family/*
  - /setting/*

# メンテナンス画面
maintenance_page:
  design: pattern-2
  script_url: https://maintenance.order.sso.biglobe.ne.jp/setting-family/index.js

# 開始・終了後の確認に使用するURL
verification_urls:
  - https://order.sso.biglobe.ne.jp/family/verified/member/add/init
  - https://order.sso.biglobe.ne.jp/setting/verified/resign/init
```

## 入力項目の説明

| 入力項目 | 説明 | 入力例 |
|---|---|---|
| `environment` | 作業環境 | `prd` |
| `maintenance_id` | メンテナンス識別子 | `family-setting` |
| `maintenance_name` | 作業名称 | `BOメンテナンス_20260826_0200-0800` |
| `start_at` | メンテナンス開始日時 | `2026-08-26T02:00:00+09:00` |
| `end_at` | メンテナンス終了日時 | `2026-08-26T08:00:00+09:00` |
| `priority` | ALBルール優先度 | `55` |
| `paths` | 対象パス、最大5件 | `/family/*` |
| `script_url` | メンテナンス画面用JavaScript | 既存URL |
| `verification_urls` | 動作確認するURL | 対象画面URL |

作業者は、次の値を入力しません。

- AWSアカウントID
- ALB名
- リスナーARN
- ルールARN
- EventBridge実行ロールARN
- EventBridgeスケジュール名
- EventBridgeの説明文
- `ModifyRule`用JSON
- `DeleteRule`用JSON
- メンテナンスHTML

これらは環境設定と入力YAMLから自動生成します。

---

# 4. システムが自動生成する内容

入力されたYAMLから、以下を生成します。

## 開始スケジュール名

```text name=generated-start-schedule-name.txt
user-bsd3308-prd-20260826-0200-family-setting-maintenance-start
```

## 終了スケジュール名

```text name=generated-stop-schedule-name.txt
user-bsd3308-prd-20260826-0200-family-setting-maintenance-stop
```

## 開始時刻

現行仕様を継続する場合、開始時刻の1分前を自動計算します。

```text name=generated-times.txt
メンテナンス開始日時：2026-08-26 02:00:00
開始スケジュール　　：2026-08-26 01:59:00
終了スケジュール　　：2026-08-26 08:00:00
```

## メンテナンスHTML

```html name=generated-maintenance.html
<!DOCTYPE html>
<html lang="ja">
<head>
  <title>メンテナンス中</title>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta
    name="format-detection"
    content="telephone=no, address=no"
  >
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >

  <script>
    const start = "2026/08/26 02:00";
    const end = "2026/08/26 08:00";
  </script>

  <script
    src="https://maintenance.order.sso.biglobe.ne.jp/setting-family/index.js"
  ></script>
</head>
<body>
</body>
</html>
```

---

# 5. Terraformが作成するもの

Terraformは以下の3リソースを作成します。

1. `/dummy`条件のALBメンテナンス用ルール
2. 開始用EventBridgeスケジュール
3. 終了用EventBridgeスケジュール

```text name=aws-resources.txt
ALBメンテナンス用ルール
├─ 作成時：/dummyに対して503を返す
├─ 開始時：対象パスにメンテナンスHTMLを返す
└─ 終了時：ルール自体を削除する

EventBridge開始スケジュール
└─ ModifyRuleを実行する

EventBridge終了スケジュール
└─ DeleteRuleを実行する
```

---

# 6. 実際のTerraformコード例

## 6.1 `/dummy`ルールの作成

最初に、利用者の通信に影響しない`/dummy`ルールを作成します。

```hcl name=terraform/maintenance/main.tf
resource "aws_lb_listener_rule" "maintenance" {
  listener_arn = var.listener_arn
  priority     = var.priority

  condition {
    path_pattern {
      values = ["/dummy"]
    }
  }

  action {
    type = "fixed-response"

    fixed_response {
      status_code  = "503"
      content_type = "text/plain"
      message_body = ""
    }
  }

  tags = {
    Name          = "${var.maintenance_name}_${var.maintenance_id}"
    Purpose       = "maintenance"
    MaintenanceId = var.maintenance_id
    Environment   = var.environment
    ManagedBy     = "Terraform"
  }
}
```

Terraformがルールを作成すると、AWSからルールARNが返されます。

```hcl name=terraform/maintenance/main.tf
locals {
  maintenance_rule_arn = aws_lb_listener_rule.maintenance.arn
}
```

そのため、現在の作業のように、作業者がルールARNをコピーする必要はありません。

---

## 6.2 メンテナンス画面の生成

開始・終了日時とJavaScriptのURLを使って、HTMLを自動生成します。

```hcl name=terraform/maintenance/main.tf
locals {
  maintenance_html = <<-HTML
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <title>メンテナンス中</title>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="format-detection" content="telephone=no, address=no">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script>
        const start = "${var.display_start_at}";
        const end = "${var.display_end_at}";
      </script>
      <script src="${var.maintenance_script_url}"></script>
    </head>
    <body>
    </body>
    </html>
  HTML
}
```

---

## 6.3 `ModifyRule`の入力JSON生成

開始時にALBルールを変更するためのJSONもTerraformが生成します。

```hcl name=terraform/maintenance/main.tf
locals {
  modify_rule_input = jsonencode({
    RuleArn = aws_lb_listener_rule.maintenance.arn

    Actions = [
      {
        Type = "fixed-response"

        FixedResponseConfig = {
          StatusCode  = "200"
          ContentType = "text/html"
          MessageBody = local.maintenance_html
        }
      }
    ]

    Conditions = [
      {
        Field = "path-pattern"

        PathPatternConfig = {
          Values = var.paths
        }
      }
    ]
  })
}
```

生成結果は、概ね次の内容になります。

```json name=generated-modify-rule.json
{
  "RuleArn": "arn:aws:elasticloadbalancing:ap-northeast-1:124997371024:listener-rule/...",
  "Actions": [
    {
      "Type": "fixed-response",
      "FixedResponseConfig": {
        "StatusCode": "200",
        "ContentType": "text/html",
        "MessageBody": "自動生成されたメンテナンスHTML"
      }
    }
  ],
  "Conditions": [
    {
      "Field": "path-pattern",
      "PathPatternConfig": {
        "Values": [
          "/family/*",
          "/setting/*"
        ]
      }
    }
  ]
}
```

---

## 6.4 開始スケジュール

開始時刻の1分前に`ModifyRule`を実行します。

```hcl name=terraform/maintenance/main.tf
resource "aws_scheduler_schedule" "maintenance_start" {
  name        = local.start_schedule_name
  group_name  = var.scheduler_group_name
  description = "${var.maintenance_name}_${var.maintenance_id} 開始"

  schedule_expression          = var.start_schedule_expression
  schedule_expression_timezone = "Asia/Tokyo"
  action_after_completion       = "DELETE"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn = (
      "arn:aws:scheduler:::aws-sdk:"
      "elasticloadbalancingv2:modifyRule"
    )

    role_arn = var.scheduler_role_arn
    input    = local.modify_rule_input

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}
```

開始時には、ALBルールが次のように変更されます。

```text name=start-rule-change.txt
変更前
  対象パス：/dummy
  応答　　：503 text/plain

変更後
  対象パス：/family/*、/setting/*
  応答　　：200 text/html
  本文　　：メンテナンス画面
```

---

## 6.5 終了スケジュール

終了時刻になると、`DeleteRule`でメンテナンス用ルールを削除します。

```hcl name=terraform/maintenance/main.tf
locals {
  delete_rule_input = jsonencode({
    RuleArn = aws_lb_listener_rule.maintenance.arn
  })
}

resource "aws_scheduler_schedule" "maintenance_stop" {
  name        = local.stop_schedule_name
  group_name  = var.scheduler_group_name
  description = "${var.maintenance_name}_${var.maintenance_id} 終了"

  schedule_expression          = var.end_schedule_expression
  schedule_expression_timezone = "Asia/Tokyo"
  action_after_completion       = "DELETE"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn = (
      "arn:aws:scheduler:::aws-sdk:"
      "elasticloadbalancingv2:deleteRule"
    )

    role_arn = var.scheduler_role_arn
    input    = local.delete_rule_input

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3
    }
  }
}
```

終了時には、次の動作になります。

```text name=stop-rule-change.txt
1. EventBridgeがDeleteRuleを実行
2. メンテナンス用ALBルールを削除
3. 通常のALBルールで処理される状態に戻る
4. 終了スケジュールも自動削除
```

---

# 7. GitHubでの実際の操作

## 作業者の操作

作業者が実施するのは次の操作です。

1. 過去のYAMLファイルをコピー
2. 日時、対象パス、名称などを変更
3. ブランチを作成
4. Pull Requestを作成
5. 自動チェックの結果を確認
6. 承認者へレビューを依頼

作業者がAWSコンソールへログインしてALBやEventBridgeを操作する必要は、原則としてありません。

---

## PR作成時の自動チェック

GitHub Actionsが、AWSへ変更を加えずに次のチェックを行います。

- YAMLの記述形式
- 開始日時が終了日時より前か
- 開始日時が未来か
- 対象パスが1～5件か
- `/`や`/*`が指定されていないか
- メンテナンスIDが15文字以下か
- スケジュール名が64文字以下か
- 優先度が50～100か
- 優先度が既存ルールと重複していないか
- 対象のALBとリスナーが存在するか
- Terraformコードに問題がないか
- AWSへ何が作成される予定か

---

## GitHub Actionsのコード例

```yaml name=.github/workflows/maintenance-plan.yml
name: Maintenance Plan

on:
  pull_request:
    paths:
      - "maintenances/active/**"
      - "terraform/maintenance/**"

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  plan:
    runs-on: ubuntu-latest

    steps:
      - name: ソースコードを取得
        uses: actions/checkout@v4

      - name: Pythonを準備
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: 入力内容を検証
        run: |
          python scripts/validate-maintenance.py \
            maintenances/active/family-setting-20260826-0200.yaml

      - name: Terraform変数を生成
        run: |
          python scripts/generate-tfvars.py \
            maintenances/active/family-setting-20260826-0200.yaml \
            > terraform/maintenance/maintenance.auto.tfvars.json

      - name: AWSへ読み取り専用で接続
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_PRD_PLAN_ROLE_ARN }}
          aws-region: ap-northeast-1

      - name: Terraformを準備
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        working-directory: terraform/maintenance
        run: terraform init

      - name: Terraform Validate
        working-directory: terraform/maintenance
        run: terraform validate

      - name: Terraform Plan
        working-directory: terraform/maintenance
        run: terraform plan -no-color
```

---

# 8. Pull Requestではどう見えるか

PRには、次のような確認結果を表示します。

```text name=pull-request-summary.txt
ALBメンテナンス設定チェック：成功

■ 対象
環境　　　　　　：prd
AWSアカウント　 ：124997371024
ALB　　　　　　 ：user-bsd3308-prd-alb3
優先度　　　　　：55

■ 日時
開始日時　　　　：2026/08/26 02:00
終了日時　　　　：2026/08/26 08:00
切り替え実行日時：2026/08/26 01:59

■ 対象パス
・/family/*
・/setting/*

■ AWSへ作成するもの
・ALBメンテナンス用ルール
・開始用EventBridgeスケジュール
・終了用EventBridgeスケジュール

■ 実行内容
開始：ModifyRule
終了：DeleteRule

Terraform Plan:
3 to add, 0 to change, 0 to destroy
```

承認者はこの内容を確認し、問題がなければPull Requestを承認します。

---

# 9. 承認後にどうなるか

Pull Requestが承認・マージされると、GitHub ActionsがTerraformを実行します。

```yaml name=.github/workflows/maintenance-apply.yml
name: Maintenance Apply

on:
  push:
    branches:
      - main
    paths:
      - "maintenances/active/**"

permissions:
  contents: read
  id-token: write

concurrency:
  group: maintenance-prd-alb3
  cancel-in-progress: false

jobs:
  apply:
    environment: production
    runs-on: ubuntu-latest

    steps:
      - name: ソースコードを取得
        uses: actions/checkout@v4

      - name: AWSへ接続
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_PRD_APPLY_ROLE_ARN }}
          aws-region: ap-northeast-1

      - name: 接続先AWSアカウントを確認
        run: aws sts get-caller-identity

      - name: Terraformを準備
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        working-directory: terraform/maintenance
        run: terraform init

      - name: 反映直前のPlanを作成
        working-directory: terraform/maintenance
        run: terraform plan -out=tfplan

      - name: AWSへ反映
        working-directory: terraform/maintenance
        run: terraform apply -auto-approve tfplan

      - name: 作成結果を確認
        run: |
          ./scripts/verify-maintenance.sh \
            maintenances/active/family-setting-20260826-0200.yaml
```

GitHub Actionsが次の順番でAWSへ設定します。

```text name=apply-result.txt
1. 正しいAWSアカウントか確認
2. /dummyのALBルールを作成
3. 作成されたルールARNを取得
4. 開始用EventBridgeスケジュールを作成
5. 終了用EventBridgeスケジュールを作成
6. 両方が同じルールARNを参照しているか確認
7. 作成結果をGitHubへ記録
```

---

# 10. GitHub上に残る証跡

次の情報がGitHubに残ります。

- 誰がメンテナンスを申請したか
- 誰が内容を確認したか
- 誰が承認したか
- どの設定値を使用したか
- Terraform Planの結果
- Terraform Applyの結果
- 実行日時
- 成功・失敗の結果

AWS側ではCloudTrailに、次の操作履歴が残ります。

- ALBルールの作成
- `ModifyRule`の実行
- `DeleteRule`の実行
- EventBridgeスケジュールの作成・削除
- 操作に使用したIAMロール

---

# 11. 現状との違い

| 現在 | 導入後 |
|---|---|
| AWSコンソールにログイン | GitHubを使用 |
| ALBを画面から探す | 環境から自動選択 |
| `/dummy`ルールを手動作成 | Terraformが作成 |
| ARNをコピー | Terraformが取得 |
| JSONを手動で貼り付け | Terraformが生成 |
| 日時を複数回入力 | YAMLへ1回入力 |
| スケジュール名を手入力 | 自動生成 |
| 開始1分前を手計算 | 自動計算 |
| EventBridgeを2件作成 | Terraformが作成 |
| AWS画面で目視確認 | PRと自動テストで確認 |
| 作業証跡を別途保存 | GitHubへ自動保存 |

---

# 12. 実装前に必ず確認すること

以下は、実装開始前に決定またはPoC確認が必要です。

## 1. 開始1分前の扱い

現行手順では、02:00開始に対して01:59に`ModifyRule`を実行します。

確認事項：

- 01:59からメンテナンス画面になってよいか
- JavaScript側で02:00まで表示を制御しているか
- 02:00ちょうどに変更した方がよいか

## 2. Terraform Stateの扱い

終了時にEventBridgeがALBルールを削除するため、Terraformの記録とAWSの実状態に差分が発生します。

確認事項：

- メンテナンスごとにTerraform Stateを分けるか
- 終了後にStateを自動整理するか
- Stateを監査目的で残すか

## 3. EventBridgeの再試行

現在は再試行OFFですが、終了処理に失敗するとメンテナンス画面が残り続けます。

選択肢：

- 現行どおり再試行しない
- 数回再試行する
- 再試行に加えて失敗通知を送る
- DLQを追加する

**推奨は「再試行あり＋失敗通知」です。**

## 4. 同時メンテナンス

確認事項：

- 同じALBで複数のメンテナンスが重なることがあるか
- 同じ対象パスが重なる可能性があるか
- 優先度55を複数案件で使用する可能性があるか

## 5. EventBridge Scheduler実行ロール

手順上は次のロールが指定されています。

```text name=scheduler-role.txt
user-bsd3308-prd-for-maintenance-scheduler
```

確認事項：

- `ModifyRule`権限があるか
- `DeleteRule`権限があるか
- 対象ALBだけに権限を限定できるか
- GitHub Actionsからこのロールを指定できるか

## 6. 終了後の確認

確認事項：

- 社外アクセスによるURL確認を自動化できるか
- 通常画面に戻ったことを何で判定するか
- 自動確認できない場合、誰が手動確認するか
- 削除失敗時の緊急解除担当者は誰か

## 7. コードの事前検証

掲載したTerraformコードは構成を示すサンプルです。実装前に検証環境で、特に以下を確認します。

- 利用するAWS Providerの対応バージョン
- EventBridge SchedulerのUniversal Target ARN
- `ModifyRule`と`DeleteRule`の入力形式
- ALB固定レスポンス本文のサイズ制限
- 自動削除後のTerraform State整理
- Schedulerのタイムゾーンと実行時刻

---

# 13. 最終的な利用イメージ

## 現在

```text name=current-operation.txt
AWSへログイン
→ ロール切り替え
→ ALBを探す
→ ルールを作る
→ ARNをコピー
→ EventBridgeを開く
→ 開始設定を作る
→ JSONを貼り付ける
→ 終了設定を作る
→ JSONを貼り付ける
→ 複数画面で内容を確認
```

## 導入後

```text name=future-operation.txt
YAMLへ日時と対象パスを入力
→ Pull Requestを作成
→ 自動チェック結果を確認
→ 責任者が承認
→ AWSへ自動反映
```

**約30～60分のコンソール作業を、約5～15分の入力・申請作業へ短縮し、設定ミスの防止と承認証跡の一元化を実現します。**

# ALBメンテナンス設定 自動化手順書・設計書（GitOps / Terraform化）

## 📌 はじめに（この仕組みでどう変わるか）

これまでBOメンテナンスやNIICメンテナンスのたびに、複数のスプレッドシートをコピーし、AWSコンソール上で何度もスイッチロールしながら手作業で行っていた約30ステップ（1ルールあたり30〜60分）の作業を、**「GitHubでYAMLファイルを1つ作ってPull Request（PR）を出すだけ」**に刷新します。

### 導入のポイント
* **1回のメンテナンスイベント ＝ 1つのYAMLファイル（1つのPR）に完全統合**
  * 今のように「BOメンテだからスプレッドシートを7個コピーして、AWSアカウントを何回もスイッチロールして…」という苦行はなくなり、**1つのYAMLにその日止める画面リストを並べてPRを出すだけ**になります。
* **AWSアカウントIDやALB名の入力不要**
  * 裏側の「マスター台帳」から自動で判別するため、人間が毎回ARNやアカウントIDを調べる必要はありません。
* **手動スイッチロール不要**
  * Terraformの `assume_role`（またはラッパースクリプトのループ処理）が全アカウント分を裏側で自動的に切り替えながら一括実行します。
* **S3リモートバックエンドによる安全なState管理**
  * ローカル実行（Phase 1）の段階から、TerraformのStateファイル（`.tfstate`）は**AWSのS3バケット（Remote Backend）**に保存し、ローカルPCには残しません。誰のPCからでも延長・解除作業を引き継げます。
* **作業時間は約30〜60分 → 約5〜10分（約70〜90%削減）へ短縮**

---

# 【第1部】自分たちが実際にやること（作業手順書）

普段のメンテナンス作業で、**作業者**と**チェッカー（承認者）**がやることは以下のステップだけです。

## 👨‍💻 1. 作業者がやること（所要時間：約5〜10分）

### Step 1：前回のYAMLファイルをコピーする
リポジトリの `maintenances/archive/`（または `templates/`）にある前回のYAMLファイルをコピーし、`maintenances/active/` フォルダに**今回の日付のファイル名**で保存します。

```bash
# 例：10月28日のNIICメンテを作る場合
cp maintenances/archive/20261014-niic.yaml maintenances/active/20261028-niic.yaml
```

### Step 2：YAMLの日時（と必要なら対象パス）を書き換える
コピーしたYAMLファイルを開き、**上部の日時（3か所）を今回のメンテナンス日時に書き換えます**。
（※対象画面やパスが前回と同じなら、下の `rules:` 以降は一切触らなくてOKです！）

```yaml name=maintenances/active/20261028-niic.yaml
# ==========================================================
# ① 毎回書き換える場所（日時とメンテナンス名）
# ==========================================================
environment: prd
maintenance_name: NIICメンテナンス_20261028_0000-0800
start_at: "2026-10-28T00:00:00+09:00"
end_at: "2026-10-28T08:00:00+09:00"

# ==========================================================
# ② 今回止める画面リスト（前回と同じなら変更不要！）
#    ※別AWSアカウントの画面も同じリストに並べるだけでOK
# ==========================================================
rules:
  # 1. family-setting (注文系: bsd3308)
  - target: family-setting
    priority: 55
    paths:
      - /family/verified/independence/apply/*
      - /setting/verified/auid/associate/*
      - /setting/verified/payment/change/*
    verification_urls:
      - https://order.sso.biglobe.ne.jp/family/verified/independence/apply/init

  # 2. fixed (注文系: bsd3308)
  - target: fixed
    priority: 56
    paths:
      - /fixed/verified/hikari/*
      - /fixed/hikari/*
    verification_urls:
      - https://order.sso.biglobe.ne.jp/fixed/verified/hikari/init

  # 3. scpf_mem (注文系: bsd3308)
  - target: scpf_mem
    priority: 58
    paths:
      - /scpf_mem/a0/chg_payment.php
      - /scpf_mem/a0/reg_payment.php
    verification_urls:
      - https://order.sso.biglobe.ne.jp/scpf_mem/a0/chg_payment.php

  # 4. hikari-plus (注文系: bsd3308)
  - target: hikari-plus
    priority: 59
    paths:
      - /hikari-plus/*
    verification_urls:
      - https://order.sso.biglobe.ne.jp/hikari-plus/init

  # 5. マイページ (マイページ系: bsd3302 ※BOメンテ等で止める場合)
  - target: mypage
    priority: 50
    paths:
      - /my/info
    verification_urls:
      - https://mypage.sso.biglobe.ne.jp/my/info
```

### Step 3：GitHubでPull Request（PR）を作成する
ブランチを切ってPushし、GitHub上でPRを作成します。
PRを作成すると、約1分で**GitHub Actions（自動チェック）が走り、PRのコメント欄に以下のようなサマリーが自動出力**されます。エラーが出ていないことを確認して、チェッカーにレビュー依頼を出します。

```text
✅ ALBメンテナンス設定チェック：成功（対象：5ルール / 2アカウント）

■ スケジュール日時（JST）
・画面表示期間　　：2026/10/28 00:00 〜 2026/10/28 08:00
・閉塞実行（開始）：2026/10/27 23:59（1分前倒し自動計算）
・解除実行（終了）：2026/10/28 08:00

■ 作成対象ルール一覧
1. [family-setting] アカウント:124997371024 / ALB:user-bsd3308-prd-alb3 / 優先度:55
2. [fixed]          アカウント:124997371024 / ALB:user-bsd3308-prd-alb3 / 優先度:56
3. [scpf_mem]       アカウント:124997371024 / ALB:user-bsd3308-prd-alb1 / 優先度:58
4. [hikari-plus]    アカウント:124997371024 / ALB:user-bsd3308-prd-alb3 / 優先度:59
5. [mypage]         アカウント:718878491827 / ALB:user-bsd3302-prd-alb2 / 優先度:50

■ Terraform Plan 結果
Plan: 15 to add, 0 to change, 0 to destroy.
```

---

## 👀 2. チェッカー（承認者）がやること（所要時間：約3分）

チェッカーは**AWSコンソールにログインする必要はありません**。GitHubのPR画面だけで確認します。

1. **PRの自動コメント（サマリー）を見る**
   * 開始・終了日時が業連（作業連絡）と合っているか？
   * 対象画面とパスが正しいか？
   * 自動チェック結果が「✅ 成功」になっているか？
2. **周辺作業のチェックリストを確認する**
   * `[x] 業連の発行・周知が完了していること`
   * `[x] BQD等への夜間アラーム無視依頼が完了していること`
3. 問題なければGitHub上で **Approve（承認）＆ Merge** ボタンを押す。
   * 👉 **これで作業完了です！**（Phase 1の手元実行期間中のみ、マージ後に手元で1行 `./scripts/apply.sh` を叩きます）

---

## 🚨 3. イレギュラー時（延長・緊急解除・片付け）に自分たちがやること

S3で状態（State）が共有されているため、**設定を作った人と当日の夜間・早朝担当者が別でも、誰のPCからでも同じ手順で対応できます**。

| やりたいこと | 自分たちがやる操作 | 裏側で起きること |
|---|---|---|
| **① メンテ時間を延長したい**<br>（メンテ開始後でもOK） | `active/20261028-niic.yaml` の **`end_at` の時刻だけを書き換えて** PR作成・マージ（Apply） | 現在の閉塞状態を維持したまま、全アカウントの終了スケジュール時刻とHTML表示時刻だけが自動更新される |
| **② 予定より早く緊急解除したい** | 該当のYAMLファイルを `active/` から **`archive/` フォルダへ移動して** PR作成・マージ（Apply） | Terraformが全アカウントのALBルールと終了スケジュールを即座に削除し、通常画面へ切り戻す |
| **③ メンテ終了後の片付け**<br>（翌日以降の通常作業） | 終わったYAMLファイルを `active/` から **`archive/` フォルダへ移動して** PR作成・マージ | EventBridgeによって既に自動削除されたリソースの記録を、TerraformのState（S3）から綺麗に掃除する |

---
---

# 【第2部】裏側でシステムがやっていること（仕組みと設計）

第1部で作業者が作成した「1つのYAMLファイル」が、どのような処理を経てAWS上のALBやEventBridge Schedulerに反映され、メンテナンス終了時に自動クリーンアップされるのか、その技術的な仕組みとコード設計を解説します。

---

## 🏗️ 1. 全体アーキテクチャ概要

システムは大きく分けて以下の4ステップで動作します。

```text
[Step 1: 入力変換]
  作業者が作成した YAML (20261028-niic.yaml)
    + マスター台帳 (target_catalog.yaml)
    │
    ▼ Pythonスクリプト（generate-tfvars.py）
    ・開始時刻の1分前（01:59等）を自動計算
    ・各画面のALB名、リスナーARN、ロールARN、JSのURLを結合
    ・Terraform用入力ファイル (terraform.auto.tfvars.json) を生成

[Step 2: Terraform による AWS リソース作成]
  terraform apply
    │
    ├─ S3リモートバックエンド（共通Stateを排他ロック＆参照）
    ├─ 各AWSアカウント（bsd3308 / bsd3302 等）へ assume_role で自動スイッチ
    │
    └─ 各ルールごとに以下の3リソースを作成（for_eachで一括処理）
        ① ALBリスナールール（/dummy に対して 503 応答）
        ② EventBridge 開始スケジュール（開始1分前: ModifyRule を予約）
        ③ EventBridge 終了スケジュール（終了時刻: DeleteRule を予約）

[Step 3: メンテナンスの自動実行]
  開始時刻の1分前（例: 01:59）
    └─ EventBridge が ModifyRule を実行
        👉 条件を対象パス（/family/*等）へ書き換え、200 OKでメンテHTMLを表示
  終了時刻（例: 08:00）
    └─ EventBridge が DeleteRule を実行
        👉 ①のALBルールを削除し、通常通信へ復旧（スケジュール自身も自動消滅）

[Step 4: Stateの自動クリーンアップ]
  メンテナンス終了後、YAMLを archive/ へ移動して terraform apply
    └─ Terraformが「AWS上で既に消えている」ことを検知し、S3のStateから綺麗に掃除
```

---

## ❓ 2. 疑問に対する回答と仕組み

### Q1. なぜメンテナンスごとに「AWSアカウントID」や「ALB名」を入力しなくていいの？
👉 **共通の「マスター台帳（`target_catalog.yaml`）」にすべて登録してあるからです。**

従来は画面ごとに分かれたExcelシートがそれぞれの固定値（AWSアカウントID、ALB名、リスナーARN、JSのURL）を持っていましたが、今後はそれらを1つの台帳ファイル（`config/target_catalog.yaml`）に集約します。
作業者が申請YAMLで「`target: family-setting`」と1行書くだけで、裏側のスクリプトが台帳から該当するAWSアカウントID、ALB名、リスナーARN、EventBridge実行ロールARNを自動で引っ張ってきて結合するため、人間が毎回調べたり入力したりする必要が一切なくなります。

### Q2. なぜ自分たちで画面ごとに「スイッチロール」をしなくていいの？
👉 **Terraformのマルチプロバイダ機能（`assume_role`）が、裏側で自動的に全アカウントへスイッチロールしながら処理するからです。**

ブラウザ（AWSコンソール）で作業する場合は、人間が1アカウントずつ手動でスイッチロールを切り替える必要がありました。
しかしTerraformでは、コード内にあらかじめ各AWSアカウントごとの接続窓口（Provider）とスイッチロール先（`arn:aws:iam::124997371024:role/se-p` 等）を定義しておくことができます。
作業者が行うのは**「最初に手元の端末でベースとなるAWS認証（SSO等）を1回通すだけ」**（Phase 2以降のCI/CDならその認証すら自動）です。あとは1回コマンドを実行すれば、Terraform自身が裏側で注文系アカウント・マイページ系アカウント・明細系アカウントへと自動的にスイッチロールしながら一括で設定を完了させます。

### Q3. ローカルで実行した時、Stateファイル（`.tfstate`）はどうなるの？
👉 **ローカルPCには一切残さず、最初からAWSの「S3バケット」に共通保存します。**

Terraformの設定（`backend "s3"`）により、誰のPCから実行しても自動的にAWS上のS3バケットにある共通のStateファイルを見に行き、同時実行を防ぐロック（`use_lockfile = true`）も自動でかかります。そのため「設定を作った人と、当日に延長・解除する人が別」でも、全く問題なく引き継ぐことができます。

---

## 🗂️ 3. マスター台帳（`config/target_catalog.yaml`）

画面ごとに異なるAWSアカウントID、ALB名、ロールARN、JavaScriptのURLは、この台帳ファイルで一元管理します（初回作成以降、普段の作業で編集することはありません）。

```yaml name=config/target_catalog.yaml
targets:
  family-setting:
    account_id: "124997371024"
    service_id: "bsd3308"
    alb_name: "user-bsd3308-prd-alb3"
    listener_arn: "arn:aws:elasticloadbalancing:ap-northeast-1:124997371024:listener/app/user-bsd3308-prd-alb3/..."
    scheduler_role_arn: "arn:aws:iam::124997371024:role/user-bsd3308-prd-for-maintenance-scheduler"
    script_url: "https://maintenance.order.sso.biglobe.ne.jp/setting-family/index.js"

  fixed:
    account_id: "124997371024"
    service_id: "bsd3308"
    alb_name: "user-bsd3308-prd-alb3"
    listener_arn: "arn:aws:elasticloadbalancing:ap-northeast-1:124997371024:listener/app/user-bsd3308-prd-alb3/..."
    scheduler_role_arn: "arn:aws:iam::124997371024:role/user-bsd3308-prd-for-maintenance-scheduler"
    script_url: "https://maintenance.order.sso.biglobe.ne.jp/fixed/index.js"

  scpf_mem:
    account_id: "124997371024"
    service_id: "bsd3308"
    alb_name: "user-bsd3308-prd-alb1"
    listener_arn: "arn:aws:elasticloadbalancing:ap-northeast-1:124997371024:listener/app/user-bsd3308-prd-alb1/..."
    scheduler_role_arn: "arn:aws:iam::124997371024:role/user-bsd3308-prd-for-maintenance-scheduler"
    script_url: "https://maintenance.order.sso.biglobe.ne.jp/scpf_mem/index.js"

  hikari-plus:
    account_id: "124997371024"
    service_id: "bsd3308"
    alb_name: "user-bsd3308-prd-alb3"
    listener_arn: "arn:aws:elasticloadbalancing:ap-northeast-1:124997371024:listener/app/user-bsd3308-prd-alb3/..."
    scheduler_role_arn: "arn:aws:iam::124997371024:role/user-bsd3308-prd-for-maintenance-scheduler"
    script_url: "https://maintenance.order.sso.biglobe.ne.jp/hikari-plus/index.js"

  mypage:
    account_id: "718878491827"
    service_id: "bsd3302"
    alb_name: "user-bsd3302-prd-alb2"
    listener_arn: "arn:aws:elasticloadbalancing:ap-northeast-1:718878491827:listener/app/user-bsd3302-prd-alb2/..."
    scheduler_role_arn: "arn:aws:iam::718878491827:role/user-bsd3302-prd-for-maintenance-scheduler"
    script_url: "https://maintenance.mypage.sso.biglobe.ne.jp/index.js"
```

---

## 🛠️ 4. Terraformコード構成

複数アカウントへの同時接続、複数ルールの一括作成、動的JSON生成を担当する主要コードです。

### 4.1 S3バックエンドと自動スイッチロール定義（`providers.tf`）
* **S3 State管理**：Stateファイル（`.tfstate`）は、指定のS3バケットで共有・排他ロック（`use_lockfile`）します。
* **自動スイッチロール**：各AWSアカウント用のプロバイダに `assume_role`（`se-p`等のロールARN）を書いておくことで、自動でスイッチロールが行われます。

```hcl name=terraform/providers.tf
terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # 全員で同じStateを参照・ロック管理するS3バックエンド（ローカルにStateは残さない）
  backend "s3" {
    bucket       = "bsd3308-prd-terraform-maintenance-state"
    key          = "alb-maintenance/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

# ==========================================
# 各アカウント用の接続窓口（自動スイッチロール）定義
# ==========================================

# 1. 注文系アカウント（bsd3308）用：自動で124997371024のse-pへスイッチ
provider "aws" {
  alias  = "bsd3308"
  region = "ap-northeast-1"
  assume_role {
    role_arn     = "arn:aws:iam::124997371024:role/se-p"
    session_name = "terraform-maintenance-bsd3308"
  }
}

# 2. マイページ系アカウント（bsd3302）用：自動で718878491827のse-pへスイッチ
provider "aws" {
  alias  = "bsd3302"
  region = "ap-northeast-1"
  assume_role {
    role_arn     = "arn:aws:iam::718878491827:role/se-p"
    session_name = "terraform-maintenance-bsd3302"
  }
}
```

---

### 4.2 メンテナンス用ALBルールの作成（`alb_rule.tf`）
YAMLで指定された各画面分（`var.rules`）を `for_each` でループさせて作成します。初期状態は `/dummy` に対して 503 を返すだけで、本番通信には影響を与えません。

```hcl name=terraform/alb_rule.tf
resource "aws_lb_listener_rule" "maintenance" {
  for_each = var.rules

  listener_arn = each.value.listener_arn
  priority     = each.value.priority

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

  # 【超重要】メンテ開始後にModifyRuleでパスが書き換わった際、
  # Terraformが「/dummyに戻そう」と差分検知して上書きしてしまうのを防ぐ
  lifecycle {
    ignore_changes = [condition, action]
  }

  tags = {
    Name          = "\${var.maintenance_name}_\${each.key}"
    Purpose       = "maintenance"
    MaintenanceId = each.key
    Environment   = var.environment
    ManagedBy     = "Terraform"
  }
}
```

---

### 4.3 メンテナンスHTMLと `ModifyRule` / `DeleteRule` のJSON自動生成（`locals.tf`）
開始・終了日時やJavaScriptのURLを埋め込んだHTML、および EventBridge Scheduler に渡す実行用JSONペイロードをTerraform内で自動生成します。
この仕組みのおかげで、人間によるARNコピペやJSONの手作りが不要になります。

```hcl name=terraform/locals.tf
locals {
  # 各ルールごとの設定値を自動マッピング
  rule_configs = {
    for k, v in var.rules : k => {
      # 1. メンテナンスHTML本文
      html = <<-HTML
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
          <script src="${v.script_url}"></script>
        </head>
        <body>
        </body>
        </html>
      HTML

      # 2. 開始時（ModifyRule）用JSON
      # 上で作成したALBルールの実ARN（aws_lb_listener_rule.maintenance[k].arn）を動的に自動参照！
      modify_input = jsonencode({
        RuleArn = aws_lb_listener_rule.maintenance[k].arn
        Actions = [
          {
            Type = "fixed-response"
            FixedResponseConfig = {
              StatusCode  = "200"
              ContentType = "text/html"
              MessageBody = local.rule_configs[k].html # 生成されたHTMLを挿入
            }
          }
        ]
        Conditions = concat(
          [
            {
              Field = "path-pattern"
              PathPatternConfig = {
                Values = v.paths
              }
            }
          ],
          length(v.query_strings) > 0 ? [
            {
              Field = "query-string"
              QueryStringConfig = {
                Values = v.query_strings
              }
            }
          ] : []
        )
      })

      # 3. 終了時（DeleteRule）用JSON
      delete_input = jsonencode({
        RuleArn = aws_lb_listener_rule.maintenance[k].arn
      })
    }
  }
}
```

---

### 4.4 開始・終了スケジュールの自動登録（`scheduler.tf`）
EventBridge SchedulerのUniversal Target（`aws-sdk:elasticloadbalancingv2:modifyRule` / `deleteRule`）を呼び出すスケジュールを作成します。

```hcl name=terraform/scheduler.tf
# ① 開始スケジュール（開始時刻の1分前に実行し、メンテナンス画面へ切り替え）
resource "aws_scheduler_schedule" "maintenance_start" {
  for_each = var.rules

  name                         = "user-\${each.value.service_id}-prd-\${var.date_prefix}-${each.key}-start"
  group_name                   = "default"
  description                  = "\${var.maintenance_name}_\${each.key} 開始"
  schedule_expression          = var.start_schedule_expression # 例: at(2026-10-27T23:59:00)
  schedule_expression_timezone = "Asia/Tokyo"
  action_after_completion      = "DELETE" # 実行完了後にスケジュール自身を自動削除

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:elasticloadbalancingv2:modifyRule"
    role_arn = each.value.scheduler_role_arn
    input    = local.rule_configs[each.key].modify_input

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3 # API一時エラーによる閉塞失敗を防ぐため3回リトライ
    }
  }
}

# ② 終了スケジュール（終了時刻に実行し、メンテナンス用ALBルールを削除）
resource "aws_scheduler_schedule" "maintenance_stop" {
  for_each = var.rules

  name                         = "user-\${each.value.service_id}-prd-\${var.date_prefix}-${each.key}-stop"
  group_name                   = "default"
  description                  = "\${var.maintenance_name}_\${each.key} 終了"
  schedule_expression          = var.end_schedule_expression # 例: at(2026-10-28T08:00:00)
  schedule_expression_timezone = "Asia/Tokyo"
  action_after_completion      = "DELETE" # 実行完了後にスケジュール自身を自動削除

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:elasticloadbalancingv2:deleteRule"
    role_arn = each.value.scheduler_role_arn
    input    = local.rule_configs[each.key].delete_input

    retry_policy {
      maximum_event_age_in_seconds = 3600
      maximum_retry_attempts       = 3 # 解除漏れを防ぐため3回リトライ
    }
  }
}
```

---

## 🤖 5. CI/CDパイプライン（GitHub Actions）の自動処理

Pull Requestが作成された際、裏側で走る自動検証スクリプトのワークフローです。AWSに一切変更を加えずに、安全性の検証と実行計画（Plan）の出力を完了させます。

```yaml name=.github/workflows/maintenance-plan.yml
name: Maintenance Plan & Validation

on:
  pull_request:
    paths:
      - "maintenances/active/**"

jobs:
  validate-and-plan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
      pull-requests: write

    steps:
      - name: リポジトリをチェックアウト
        uses: actions/checkout@v4

      - name: Python環境のセットアップ
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      # 入力バリデーション（日時順序、全通信遮断パスの禁止、優先度重複など）
      - name: 入力YAMLの安全性チェック
        run: |
          python scripts/validate-maintenance.py \
            --active-dir maintenances/active/ \
            --catalog config/target_catalog.yaml

      # YAMLと台帳を突合してTerraform変数を生成
      - name: tfvarsの自動生成
        run: |
          python scripts/generate-tfvars.py \
            --active-dir maintenances/active/ \
            --catalog config/target_catalog.yaml \
            > terraform/maintenance.auto.tfvars.json

      - name: Terraformセットアップ
        uses: hashicorp/setup-terraform@v3

      - name: Terraform Init & Plan
        working-directory: terraform
        run: |
          terraform init
          terraform plan -no-color -out=tfplan

      # PRコメント欄にサマリーとPlan結果を自動投稿
      - name: PRへサマリーをコメント
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const summary = fs.readFileSync('scripts/pr-summary.txt', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: summary
            });
```

---

## 🚀 6. 段階的な導入計画（3フェーズ）

| フェーズ | 自分たちの操作 | 裏側の動き |
|---|---|---|
| **Phase 1**<br>（スモールスタート） | ① YAMLを作ってPR作成・承認<br>② 手元のターミナルで `./scripts/apply.sh` を1回実行 | PR上でJSON生成と入力チェックを自動化。反映時のみ手元の `se-p` 権限を使って全アカウントへ自動スイッチロール＆一括Apply（StateはS3で共有） |
| **Phase 2**<br>（検証環境CI/CD） | ① YAMLを作ってPR作成・承認（マージ）のみ | GitHub Actionsが検証環境（stg/dev）へOIDC接続し、マージと同時に自動で `terraform apply` まで完結 |
| **Phase 3**<br>（本番環境CI/CD） | ① YAMLを作ってPR作成・承認（マージ）のみ | 本番環境（prd）もGitHub上のPRマージだけで全アカウントへの設定が完結（コマンド実行すら不要に） |

---

## 💡 7. まとめ（なぜミスと作業時間が激減するのか）

1. **1イベント＝1 YAMLへの集約とマスター台帳化**
   * 画面ごとに分かれていたExcel手順書を廃止し、不変のパラメータは「マスター台帳」へ隠蔽。作業者は「いつ・どの画面を止めるか」だけを1つのYAMLに書けばよくなります。
2. **コピペと手計算の完全廃止**
   * 最も事故が起きやすかった「ルールARNの手動コピー」は、Terraformがルール作成時に取得した実ARN（`aws_lb_listener_rule.maintenance.arn`）を自動でEventBridgeの入力JSONに埋め込むため、**人為的ミスが物理的に発生しません。**
   * 「開始1分前の手計算」もスクリプトが自動で計算します。
3. **自動スイッチロールとS3 Stateによる安全な運用**
   * 手動でのスイッチロールが不要になり、StateもS3で一元管理されるため、誰がいつ作業しても整合性が保たれます。
   * `lifecycle { ignore_changes = [condition, action] }` と終了後の `archive/` 移動により、EventBridgeが自動削除した後のState整理も安全に行われます。

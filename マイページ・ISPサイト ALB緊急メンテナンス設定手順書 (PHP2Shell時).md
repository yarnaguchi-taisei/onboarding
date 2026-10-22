# マイページ / ISPサイト ALB緊急メンテナンス設定手順書 (PHP2Shell時)

PHPの重大な脆弱性対応に伴い、評価環境（test）およびステージング環境（stg）の各サービスにおいて、一時的にALB（Application Load Balancer）で固定レスポンスを返却し、アクセスを遮断するための設定手順です。

---

## 🛠️ 1. ALBメンテナンス設定 共通手順 (test / stg 共通)

### Step 1: 対象のAWSアカウントへスイッチロール
設定対象の環境に合わせて、AWSマネジメントコンソールで適切なアカウント・ロールへスイッチします。(ロールはse-p。se権限だとできない)

* **評価環境 (test / test2〜4 / evl)**
  * **アカウントID**: `〇〇`
  * **ロール**: `se-p`
* **ステージング環境 (stg)**
  * **アカウントID**: `〇〇`
  * **ロール**: `se-p`

### Step 2: 対象ALBのリスナールール追加・編集
1. AWSマネジメントコンソールの **[EC2] ＞ [ロードバランサー]** 画面から、対象サービスが紐づくALBを選択します。
2. **[HTTPS:443]** リスナー（問い合わせフォーム等、HTTPアクセスも制御する場合は **[HTTP:80]** リスナーも対象）の **[ルールを表示/編集]** を開きます。
3. ルールの追加（または既存メンテルールの編集）を選択し、以下の通りパラメータを設定します。

| 設定項目 | 設定値 | 注意事項・備考 |
| :--- | :--- | :--- |
| **条件 (IF)** | **パス**: `/*` | ISPサイト系も含め、今回は一括遮断のためスケジュール等の条件は設定しません。 |
| **アクション (THEN)** | **固定レスポンスを返す** | |
| **レスポンスコード** | **`200`** | デフォルトの `503` ではなく、**`200`** を手動で入力して変更します。 |
| **Content-Type** | **`text/html`** | デフォルトの `text/plain` から必ず変更してください。 |
| **レスポンス本文** | 下記の「HTMLテンプレート」 | サービスおよび検証環境の番号に応じて、`<script src="...">` の読み込み先JSを変更します。 |
| **優先度 (Priority)** | **既存の通常転送ルールより上位 (若い番号)** | 例: `1` 〜 `10` など。**保存した瞬間に即時でメンテナンス画面へ切り替わります。** |

---

## 📝 2. レスポンス本文 (HTMLテンプレート)

以下のHTMLをコピーし、`<script src="...">` の部分を設定対象のサービス・環境に応じたJSのURLに差し替えてALBのレスポンス本文に貼り付けてください。

> [!TIP]
> 文字化け防止を確実にするため、`<head>` 内の先頭に `<meta charset='utf-8'>` を明示的に追加しています。また、空の `<script></script>` ブロックは日時変数（`start`, `end`）を意図的に未定義にすることで、メンテナンス画面上の「日時表示エリア」を非表示にする挙動（日時未定メンテ仕様）に対応しています。

```html
<!DOCTYPE html>
<html lang='ja'>
<head>
<meta charset='utf-8'>
<title>メンテナンス中</title>
<script>
</script>
<script src='【ここに環境・サービス別のJSのURLを入れる】'></script>
</head>
<body>
</body>
</html>
```

---

## 🔗 3. サービス別・環境別 JS URL一覧

各ALBのレスポンス本文に設定するメンテナンス画面用のJavaScriptファイル（`index.js`）のURL一覧です。

> [!WARNING]
> **test2 〜 test4 等の複数評価環境を設定する場合の注意点**
> メンテナンス画面表示用の静的資材（JSファイル）は、`-test2` や `-test3` などの個別ドメイン配下には用意されていない場合があります。そのため、**`-test2`〜`-test4` のALBを設定する場合も、HTML内の `<script src="...">` に指定するドメインはすべて共通の `-test` (1系) のURLを指定してください。** これにより正常にメンテナンス画面がレンダリングされます。

### 1. マイページ・会員系サービス

| No | 対象システム (手順書名) | 対象ドメイン | ステージング環境 (stg) 用 JS URL | 評価環境 (test / test2 共通) 用 JS URL |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **マイページ** (BSD3302) | `mypage` | `https://maintenance.mypage-staging.sso.biglobe.ne.jp/mypage/index.js` | `https://maintenance.mypage-test.sso.biglobe.ne.jp/mypage/index.js` |
| **2** | **利用明細** (BSD3425) | `member` | `https://maintenance.member-staging.sso.biglobe.ne.jp/meisai/index.js` | `https://maintenance.member-test.sso.biglobe.ne.jp/meisai/index.js` |
| **3** | **ガイダンス** (BSD3426) | `guidance` | `https://maintenance.guidance-staging.sso.biglobe.ne.jp/guidance/index.js` | `https://maintenance.guidance-test.sso.biglobe.ne.jp/guidance/index.js` |
| **4** | **Gポイント** (BSD3383) | `gpoint` | `https://maintenance.gpoint-st.sso.biglobe.ne.jp/gpoint/index.js`<br>*(※存在しない場合は本番または `-test` を参照)* | `https://maintenance.gpoint-test.sso.biglobe.ne.jp/gpoint/index.js` |

### 2. ISPサイト系サービス (BSD3308)

ISPサイト系のメンテナンス用JSは、すべて `maintenance.order-staging`（評価環境は `maintenance.order-test`）配下に格納されています。

| No | 対象システム (手順書名) | 対象ALB (ドメイン) | ステージング環境 (stg) 用 JS URL | 評価環境 (test / test2〜4 共通) 用 JS URL |
| :---: | :--- | :--- | :--- | :--- |
| **5** | **fixed** | `alb3` (`order`) | `https://maintenance.order-staging.sso.biglobe.ne.jp/fixed/index.js` | `https://maintenance.order-test.sso.biglobe.ne.jp/fixed/index.js` |
| **6** | **family & setting** | `alb3` (`order`) | `https://maintenance.order-staging.sso.biglobe.ne.jp/setting-family/index.js` | `https://maintenance.order-test.sso.biglobe.ne.jp/setting-family/index.js` |
| **7** | **perl** | `alb3` (`order`) | `https://maintenance.order-staging.sso.biglobe.ne.jp/perl/index.js` | `https://maintenance.order-test.sso.biglobe.ne.jp/perl/index.js` |
| **8** | **hikari-plus** | `alb3` (`order`) | `https://maintenance.order-staging.sso.biglobe.ne.jp/hikari-plus/index.js` | `https://maintenance.order-test.sso.biglobe.ne.jp/hikari-plus/index.js` |
| **9** | **scpf_mem** | `alb2` (`member1`) | `https://maintenance.order-staging.sso.biglobe.ne.jp/scpf_oss-scpf_mem-gpcgi/index.js` | `https://maintenance.order-test.sso.biglobe.ne.jp/scpf_oss-scpf_mem-gpcgi/index.js` |
| **10** | **gpcgi & scpf_oss** | `alb4` (`signup`) | `https://maintenance.order-staging.sso.biglobe.ne.jp/scpf_oss-scpf_mem-gpcgi/index.js`<br>*(※停止用: `.../scpf_oss-stop/index.js`)* | `https://maintenance.order-test.sso.biglobe.ne.jp/scpf_oss-scpf_mem-gpcgi/index.js`<br>*(※停止用: `.../scpf_oss-stop/index.js`)* |

---

## 💡 ISPサイト（`order` / `member1` / `signup`）設定時の設計・動作補足

1. **JS配信ドメインの集約ルール**
   * 設定対象のWebサイトドメイン自体は `member1-*.sso.biglobe.ne.jp` や `signup-*.sso.biglobe.ne.jp` ですが、ALBに記述する読み込み先JSは **`maintenance.order-staging.sso.biglobe.ne.jp`** または **`maintenance.order-test.sso.biglobe.ne.jp`** を指定します。
2. **`order` ドメイン（ALB3）の一括メンテナンス適用について**
   * `fixed`、`family & setting`、`perl`、`hikari-plus` は物理的に同一のロードバランサー（`user-bsd3308-*-alb3`）で稼働しています。
   * パス条件を `/*` で1本のルールとして統合設定する場合、上記No.5〜8のいずれか1つのJS（例: `setting-family/index.js` や `fixed/index.js`）を指定することで、`order` ドメイン配下すべてのアクセスに同一のメンテナンス画面を一斉表示させることができます。
   * もし画面文言やデザインをパスグループごとに細かく分けたい場合のみ、従来の手順通りターゲットパスを `/fixed/*` や `/hikari-plus/*` に個別に分け、それぞれルールを定義してください。

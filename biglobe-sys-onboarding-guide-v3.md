# BIGLOBE社内システム（情シス系）新入社員向け解説ガイド
〜申し込みからアカウント開通・請求開始までのリアルと理想〜

新入社員のみなさん、BIGLOBEへようこそ！
このガイドは、私たちが日々お客様に届けているインターネット接続サービス（ビッグローブ光など）の裏側で、**どのような社内システムが、どのように連携して動いているか**を分かりやすく解説した研修用ドキュメントです。

現在、BIGLOBEは「NextBIGLOBE」と呼ばれる大規模な社内システム変革を行っています。昔からの古いシステム（レガシー）と、最先端のSalesforce（SaaS）ベースのシステムがどのようにハイブリッドに連携しているか、データの旅路を追いかけながら紐解いていきましょう！

---

## 1. 【全体システム連携マップ】現行システムが織りなす構造
まずは、当社の社内システム（情シス系）の全体像を俯瞰してみましょう。
以下のフローチャートは、受付窓口となる「顧客接点フロント」から、中核となる「Salesforce領域」、新旧システムを繋ぐ「中継ハブ」、そして「バックエンド・外部連携・AI分析領域」まで、**現在動いている主要システムがどのゾーンに属し、どう繋がっているか**を一望できるようにまとめたマップです。

```mermaid
graph TD
    %% 全体のカラー定義やクラス
    classDef front fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef sf fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef hub fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef backend fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef ext fill:#eceff1,stroke:#455a64,stroke-width:2px;

    %% フロント接点ゾーン
    subgraph ZoneFront [① 顧客接点・受付フロント領域]
        OSS[自社Web申込 OSS]
        Einstein[ノンボイスAI Einsteinボット]
        BLUE[代理店・パートナー端末 BLUE]
        Orange[KDDI店舗端末 Orange]
        CS[コールセンター CS端末]
    end

    %% Salesforce NextBIGLOBEコア
    subgraph ZoneSF [② 新基盤 Salesforce領域]
        KIZUNA[KIZUNA / Service Cloud<br>顧客管理・CRM・カルテ]
        YUI[YUI / Communications Cloud<br>販売管理・オーケストレーション]
    end

    %% データ連携ハブ
    subgraph ZoneHub [③ データ連携ハブ]
        BF[BackForce<br>新旧/外部連携データハブ]
    end

    %% バックエンド・プロビジョニング・レガシー
    subgraph ZoneBackend [④ バックエンド＆プロビジョニング領域]
        Clalis[Clalis<br>NTT工事日即決API]
        optical[optical<br>プロビ外部連携システム]
        BO[BO / 旧DB<br>昔からの顧客・会員管理]
        VAS[VAS<br>付加価値サービス管理]
    end

    %% 外部・決済・分析
    subgraph ZoneExt [⑤ 外部連携・決済・AI分析領域]
        NTT[NTT東西システム]
        Logi[発送業者]
        Zuora[Zuora<br>課金請求SaaS]
        AI[AI分析 / DHW]
    end

    %% 線の引き方
    %% フロントからSalesforceへ
    OSS -->|申込データ| KIZUNA
    Einstein <-->|顧客チャット対応| KIZUNA
    BLUE -->|申込情報登録| KIZUNA
    Orange -->|申込情報登録| KIZUNA
    CS -->|受付情報登録| KIZUNA

    KIZUNA -->|申込・契約データ| YUI

    %% 工事日即決（Clalis）の流れ
    OSS <-->|リアルタイム空き枠照会| Clalis
    BLUE <-->|リアルタイム空き枠照会| Clalis
    Orange <-->|リアルタイム空き枠照会| Clalis
    CS <-->|リアルタイム空き枠照会| Clalis
    Clalis <-->|NTT-API連携 35秒問題| NTT

    %% YUIからデータ連携
    YUI <-->|API/バッチ同期| BF

    %% ハブからバックエンド・レガシーへ
    BF <-->|会員データ同期| BO
    BF <-->|SO連携| optical
    BF <-->|付加サービス連携| VAS

    %% optical・外部連携
    optical <-->|プロビジョニング指示| NTT
    optical -->|ルーター発送指示| Logi

    %% Salesforceから請求＆分析へ
    YUI -->|課金開始トリガー| Zuora
    YUI -->|契約実績データ同期| AI
    BO -->|旧会員請求同期| Zuora

    %% クラス適用
    class OSS,Einstein,BLUE,Orange,CS front;
    class KIZUNA,YUI sf;
    class BF hub;
    class Clalis,optical,BO,VAS backend;
    class NTT,Logi,Zuora,AI ext;
```

---

## 2. 申し込みから開通・課金開始までの【全体データ連携シーケンス図】
システム全体マップを頭に入れたところで、次は**「お客様が申し込んでから、インターネットが繋がり、課金（請求）が開始されるまで」**のデータの旅路を、時系列（シーケンス図）で追ってみましょう！

現在BIGLOBEで稼働しているすべての主要システムが、裏側でどのように「会話」しているかがひと目でわかります。

```mermaid
sequenceDiagram
    autonumber
    actor Customer as お客様
    participant Channel as 受付チャネル<br>(OSS/BLUE/Orange/CS)
    participant Clalis as Clalis (中継API)
    participant NTT as NTT東西
    participant KIZUNA as KIZUNA (顧客CRM)
    participant YUI as YUI (統合販売管理)
    participant BF as BackForce (データハブ)
    participant BO as BO (旧基幹DB)
    participant optical as optical (プロビ外部)
    participant Zuora as Zuora (課金請求)

    %% 1. 工事日即決
    rect rgb(240, 248, 255)
        Note over Customer, NTT: 1. 申し込み & 工事日その場即決 (8:00〜22:00限定 / 35秒問題の壁)
        Customer->>Channel: 回線申し込み情報の入力
        Channel->>Clalis: NTT空き枠照会を要求
        Clalis->>NTT: リアルタイム空き枠照会 (NTT-API呼び出し)
        NTT-->>Clalis: 工事空き枠データを返却
        Clalis-->>Channel: 工事可能日リストを返却
        Channel->>Customer: 工事日を提示・選択
        Customer->>Channel: 希望日を決定 (即決)
        Channel->>Clalis: 工事予約・オーダーを登録
        Clalis->>NTT: 注文登録 (NTT-API呼び出し)
        NTT-->>Clalis: 工事予約完了通知
    end

    %% 2. データ格納と新旧同期
    rect rgb(255, 245, 238)
        Note over Channel, BO: 2. 申込データのSalesforce格納 ＆ 新旧データベースの同期
        Channel->>KIZUNA: 申込情報を登録 (顧客カルテ作成)
        KIZUNA->>YUI: 契約・申込情報を連携
        YUI->>YUI: 注文チェック & オーケストレーションプラン作成
        YUI->>BF: 申込同期データを送信 (API / 同期バッチ)
        BF->>BO: 旧会員DBに会員データパッチを反映 (新旧同期)
    end

    %% 3. 工事手配・ルーター発送・開通テスト
    rect rgb(240, 255, 240)
        Note over YUI, Customer: 3. プロビジョニング (機器発送 ＆ 工事開通 ＆ 疎通テスト)
        YUI->>BF: サービスオーダー(SO)連携
        BF->>optical: プロビジョニング指示を連携
        optical->>Customer: 宅内接続機器 (IPv6ルーターなど) の発送手配
        KIZUNA->>Customer: 会員証 (接続IDなど) の郵送
        Note over Customer, NTT: 工事日当日
        NTT->>Customer: 光回線の開通工事 (派遣または無派遣)
        Customer->>Customer: ルーター接続・電源ON
        NTT-->>optical: 回線開通完了 (異動情報) を通知
        optical->>optical: インターネット自動疎通確認 (8.8.8.8へのPing送信)
        optical-->>BF: プロビジョニング完了通知
        BF-->>YUI: 開通完了をステータス更新
        YUI-->>KIZUNA: 顧客ステータスを「アクティブ（開通済み）」に変更
    end

    %% 4. 課金開始
    rect rgb(255, 240, 245)
        Note over YUI, Zuora: 4. 課金請求ビジネスサイクルの起動
        YUI->>Zuora: 開通トリガー送信 (課金開始・特典適用指示)
        Zuora->>Zuora: 月額基本料金の日割り/月額計算、キャンペーン値引きの自動管理開始
    end
```

---

## 3. フロー図のステップ別詳細解説

### 【STEP 1】 申し込みと工事日即決 (ゴールデンルート：GR)
*   **処理内容:** 
    お客様が窓口からビッグローブ光を申し込む際、中継APIシステムである「Clalis」を介して、NTT東西の空き工事枠をリアルタイムに確認。その場で希望の工事日を確定（即決）させます。
*   **現場で絶対に覚えておきたい情シスTIPS:**
    *   **「8:00〜22:00」の壁:** NTT東西のAPIが夜間停止するため、Clalisによる即決機能もこの時間帯しか動きません。時間外の申込は「非即決」となり、後日コンタクトセンターからの電話調整が必要です。
    *   **恐怖の「35秒問題」:** NTTのシステムにオーダーを取り次ぐ際、APIレスポンスに最大「35秒」を要する仕様があります。システムがフリーズしたわけではないため、新入社員のみなさんは開発・テスト時に「35秒」のウェイトが発生することを必ず覚えておいてください。

### 【STEP 2】 申込データの格納と新旧データベース同期
*   **処理内容:** 
    確定した申込情報は、Salesforce内の顧客管理システム「KIZUNA」で一括して受領され、そこから販売管理システム「YUI」に送られます。「YUI」がオーケストレーション（各システムへの自動処理の差配）を実行。データハブ「BackForce」を通じて、レガシーDBである「BO」へ会員データパッチをあて、プロビ外部連携の「optical」へオーダーを流します。
*   **現場で絶対に覚えておきたい情シスTIPS:**
    *   新システムであるSalesforce(YUI)と、旧システム(BO、optical)が並行して動いているため、まれに「新旧DB間でのデータの不整合」が発生することがあります。これを解消するのもアジャイル開発部やシステム運用チームの大切な仕事です。

### 【STEP 3】 各種ハガキ・接続機器の発送と受け取り
*   **処理内容:** 
    会員作成完了に伴い、お客様に接続用IDが記載された「会員証」が郵送されます（紙を希望されない場合は電子メール/マイページ提供）。同時に「optical」が発送管理システムと連携し、開通当日に必要なIPv6対応ルーターなどの宅内接続機器を発送します。

### 【STEP 4】 回線開通工事と疎通テスト
*   **処理内容:** 
    工事日にNTTの工事業者が回線を通します。その後、お客様がルーターをご自身で接続・電源ONにすることで、自動的にプロビジョニングが完了。opticalはネットワークの正常動作確認（8.8.8.8などのパブリックDNS宛て疎通テスト等）を行い、完了通知をYUIへ返します。これをもって、お客様の契約状態は「申込中」から「完了（アクティベーション成功）」に遷移します。

### 【STEP 5】 課金請求処理の開始 (Zuoraの起動)
*   **処理内容:** 
    開通完了通知を受け取ったYUIは、課金請求専門のグローバルSaaS「Zuora」に開通トリガーを送信します。Zuoraは会員情報・商品契約情報・特典情報（キャッシュバックや月額割引）を読み込み、日割り計算や初回月額基本料、初期工事費などの課金ログを自動生成します。ここからお客様の「ビジネスライフサイクル」が動き出します。

---

## 4. 情シス系システムの構造（現実と理想）

BIGLOBEのシステムを理解するもう一つのポイントは、**「これまでの古いスパゲッティ状態（As-Is）」から「Salesforceを中心としたシンプルな状態（To-Be / NextBIGLOBE）」への変革のロードマップ**を知ることです。

### ① 【理想：To-Be】NextBIGLOBEのシンプルアーキテクチャ
NextBIGLOBEでは、顧客接点（フロント）から、販売管理、各種プロビジョニング、そして共通基盤までをSalesforce（および一部専門SaaS）で一元的に統合・管理する形を目指しています。

```mermaid
graph TD
    %% フロント・接点
    subgraph Front [顧客接点・フロント領域]
        Web[公式Webサイト/マイページ]
        Einstein[Einsteinボット / ノンボイスAI]
    end

    %% Salesforce基盤
    subgraph Salesforce [NextBIGLOBEコア（Salesforce）]
        KIZUNA[KIZUNA / Service Cloud<br>顧客管理・CRM・カルテ]
        YUI[YUI / Communications Cloud<br>統合販売管理・オーケストレーション]
    end

    %% 共通基盤・SaaS
    subgraph Platform [共通基盤・専門SaaS]
        Zuora[Zuora<br>課金請求・サブスク管理]
        SO[SO基盤<br>サービスオーダー管理]
        Clalis[Clalis<br>NTT工事日即決API]
    end

    %% NTT・発送
    subgraph External [社外連携・配送系]
        NTT[NTT東西システム]
        Logi[発送業者]
    end

    %% 接続関係
    Web -->|問合せ/申込| Einstein
    Web -->|申込データ| KIZUNA
    Einstein -->|チャット対応・トスアップ| KIZUNA
    KIZUNA -->|契約申込| YUI
    
    YUI -->|工事日調整| Clalis
    Clalis <-->|リアルタイム通信| NTT
    
    YUI -->|課金・請求指示| Zuora
    YUI -->|サービスオーダー| SO
    SO -->|発送指示| Logi
```

### ② 【現実：As-Is / ハイブリッド】新旧システムが絡み合うリアルな構造
現在は変革の途中のため、最新のSalesforceベースの「KIZUNA」「YUI」と、従来からの基幹データベース「BO」、スクラッチで開発された外部連携システム「optical」が**BackForce**などのハブを介して複雑に連携しながら稼働しています。

```mermaid
graph TD
    %% 新システム領域
    subgraph Salesforce [NextBIGLOBE（新システム）]
        KIZUNA[KIZUNA<br>顧客管理 / CRM]
        YUI[YUI<br>統合販売管理]
    end

    %% 中継ハブ
    BackForce[BackForce<br>新旧・外部データ連携ハブ]

    %% レガシー・旧システム領域
    subgraph Legacy [レガシー基盤（旧システム）]
        BO[BO / 旧DB<br>昔からの顧客・会員管理]
        optical[optical<br>プロビジョニング外部連携]
    end

    %% 外部
    NTT[NTT東西システム]
    Logi[発送業者]

    %% データの流れ
    KIZUNA -->|申込集約| YUI
    YUI <-->|API/同期バッチ| BackForce
    BackForce <-->|会員データパッチ| BO
    BackForce <-->|注文連携・発送依頼| optical
    optical <-->|開通プロビジョニング| NTT
    optical -->|発送指示| Logi
    
    %% 注釈用の補足
    style Legacy fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    style Salesforce fill:#d1ecf1,stroke:#17a2b8,stroke-width:2px
```

---

## 5. 主要システムの役割と詳細解説

新入社員のみなさんが、実際の業務や会議、仕様書で遭遇する主要なシステム・用語の解説です。これらを頭に入れておくだけで、会議の理解度や仕様書の読み込み速度が劇的に上がります！

| システム名 | 今回追加 | 世代 | 役割と詳細 | 新人が覚えておきたいTIPS |
| :--- | :---: | :---: | :--- | :--- |
| **KIZUNA** | - | 新世代 | Salesforce **Service Cloud**ベース。<br>BIGLOBEの顧客管理・CRMの心臓部。取引先管理や「お客様カルテ（問い合わせ履歴・契約履歴）」の役割を持つ。 | 「オブジェクト」（テーブルのようなもの）単位でデータ構造が異なるので、まずは主要オブジェクトの意味から覚えていきましょう。 |
| **YUI** | - | 新世代 | Salesforce **Communications Cloud**ベース。<br>統合販売管理システム。フロントと基盤を結ぶ。各サブシステムがバラバラに持っていた販売・契約管理をYUIに集約する。 | 複雑な「オーケストレーション（全体処理の自動制御）」により、プロビジョニング状況を一目で可視化できます。 |
| **BO**<br>(Back Office) | - | レガシー | Salesforce導入以前からBIGLOBEを支えている、昔からの顧客情報・会員管理・決済情報などが格納されている基幹データベース。 | 昔から契約しているお客様のデータは現在もここで管理されており、新システム(Salesforce)とのデータ同期が極めて重要です。 |
| **BackForce** | ✔ | 連携ハブ | 新システム(Salesforce)と、旧レガシーシステム(BO)や外部システム群の間に立ち、APIやバッチを使ってデータの受け渡し・同期をコントロールするハブ。 | 新旧システムのスパゲッティ化を防ぐための、頼れる「中継ハブ」です。 |
| **optical** | ✔ | レガシー | プロビジョニング（開通）外部連携システム。スクラッチ（手作り）で開発され、NTT東西や発送業者などの社外システムと直接やりとりする。 | 実処理は非常に複雑で、長年のノウハウが詰まったブラックボックスに近いシステムです。順次YUI等に権限を移行中。 |
| **Clalis**<br>(クラリス) | - | 新世代 | NTT東西のシステムと接続し、工事日をその場で確定（即決）させるためのAPI中継システム。 | センター担当者が手動で行っていたNTT手配を自動化し、コールセンターの負担を劇的に減らした救世主。 |
| **BLUE** | ✔ | フロント周り | Salesforce内で動作し、Clalisを経由してNTTの工事日を取得・即決するためのソフトウェア（販売パートナー工事日即決システム）。 | 通称は「bIGLOBE User Entry」。代理店や開通センターなどで、スタッフが工事日を即決する際に活躍します。 |
| **Orange**<br>(オレンジ) | ✔ | フロント周り | KDDIの店舗（auショップや家電量販店等）のタブレット受付システムから、Clalisをたたいて工事日即決を可能にするシステム。 | 通称は「OPeRation Next aGe」。KDDIとのアライアンス（提携）を技術で支える重要な連携システムです。 |
| **Zuora** | ✔ | 新世代 | グローバル標準のサブスクリプション課金請求SaaS。複雑なキャンペーン（特典割引、工事費分割、解約時の違約金など）を柔軟に管理・課金計算する。 | これまでの独自開発だった複雑な課金計算システムから、Zuoraへの移行を進めています。 |
| **Einsteinボット**<br>(ノンボイスAI) | ✔ | 新世代 | Salesforce上で動くAIチャットボット。Webサイトで自動一次応答や、適切な有人オペレーター窓口へのルーティングを行う。 | 「からくり」というAIチャットボット製品もありますが、EinsteinボットはSalesforceと密結合し、顧客データを直接参照できる強みがあります。 |
| **VAS**<br>(Value Added Service) | - | レガシー | IPv6、ひかりTV、U-NEXTなど、回線に付随する「付加価値サービス」の販売・管理システム。 | 回線商品とセットで販売されることが多いですが、仕様が大変複雑で、社内でも「ブラックボックス」と呼ばれることが多いです。 |

---

## 6. まとめ：新入社員の皆さんへ

BIGLOBEのシステム開発は、**「新しくてイケてるSalesforce(KIZUNA/YUI)」と「長年会社を支え続けているレガシー(BO/optical)」を組み合わせながら、いかにお客様の体験（CX：Customer Experience）を向上させるか**の戦いでもあります。

システム間の連携はスパゲッティのように見えるかもしれませんが、
*   フロントの顧客カルテは **KIZUNA**
*   販売や手続きの流れは **YUI**
*   APIによる工事日即決は **Clalis**
*   裏側の古い会員管理DBは **BO**
*   課金請求は **Zuora**

という主要なシステムたちの「会話（連携）」が頭の中でつながると、業務の解像度は一気に上がります。

わからないことがあったら、最初は「なんじゃらほい」でも全く構いません。開発やテスト、運用を通じて、この巨大なパズルを一緒に解き明かしていきましょう！

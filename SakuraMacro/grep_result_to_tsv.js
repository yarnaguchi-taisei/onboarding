// Sakura Editor JScript macro
// Convert current grep results to six-column TSV.
//
// Spreadsheet columns:
// A: grep対象文字列
// B: grep結果（ヒット時は空欄、未ヒット時は「なし」）
// C: サービス（画面）
// D: 空欄
// E: ファイル
// F: 該当行の内容
//
// 複数フォルダのgrep結果を同じタブへ出力した場合にも対応します。
// ヒットが0件のフォルダは「フォルダー」行から取得します。

var sourceText = getDocumentText();

if (trimText(sourceText) == "") {
    Editor.MessageBox(
        "grep結果が空です。\r\ngrep結果の画面で実行してください。",
        0
    );
} else {
    runConversion(sourceText);
}

function runConversion(sourceText) {
    var keywordInput = Editor.InputBox(
        "検索文字列を | で区切って入力してください。\r\n\r\n" +
        "例:\r\n" +
        "会員証|初期契約解除|接続ID通知書|家族会員登録証",
        "grep結果をTSV化",
        0
    );

    if (keywordInput == null || trimText(keywordInput) == "") {
        Editor.MessageBox(
            "検索文字列が入力されていません。",
            0
        );
        return;
    }

    var keywords = parseKeywords(keywordInput);

    if (keywords.length == 0) {
        Editor.MessageBox(
            "有効な検索文字列がありません。",
            0
        );
        return;
    }

    var normalizedText = String(sourceText);
    normalizedText = normalizedText.replace(/\r\n/g, "\n");
    normalizedText = normalizedText.replace(/\r/g, "\n");

    var lines = normalizedText.split("\n");

    var rows = [];
    var hitMap = {};
    var services = [];
    var serviceMap = {};

    var parsedCount = 0;
    var skippedCount = 0;

    var i;
    var j;

    // キーワードごとのヒット状況を初期化
    for (i = 0; i < keywords.length; i++) {
        hitMap[keywords[i]] = {};
    }

    // grep結果を上から順番に解析
    for (i = 0; i < lines.length; i++) {
        var line = lines[i];

        if (trimText(line) == "") {
            continue;
        }

        // 「197 個が検索されました。」などは無視
        if (/^\s*\d+\s*個が検索されました。?\s*$/.test(line)) {
            continue;
        }

        // 「フォルダー」行からサービス名を取得
        // 0件のフォルダを認識するために必要
        var folderService = detectServiceFromFolderLine(line);

        if (folderService != "") {
            addService(
                folderService,
                services,
                serviceMap
            );

            continue;
        }

        // 検索条件などのヘッダー行を無視
        if (isHeaderLine(line)) {
            continue;
        }

        // 通常のgrep結果行を解析
        var parsed = parseResultLine(line);

        if (parsed == null) {
            skippedCount++;
            continue;
        }

        parsedCount++;

        addService(
            parsed.service,
            services,
            serviceMap
        );

        // この行に含まれる検索文字列をすべて取得
        var matched = findMatchedKeywords(
            parsed.content,
            keywords
        );

        // 入力した検索文字列が含まれない行は出力しない
        if (matched.length == 0) {
            skippedCount++;
            continue;
        }

        // 該当キーワードをヒット済みにする
        for (j = 0; j < matched.length; j++) {
            hitMap[matched[j]][parsed.service] = true;
        }

        // スプレッドシート用の6列を追加
        rows.push([
            matched.join("、"),
            "",
            parsed.service,
            "",
            parsed.fileDisplay,
            cleanContent(parsed.content)
        ]);
    }

    // 古い形式などで「フォルダー」行を拾えなかった場合の予備処理
    if (services.length == 0) {
        var headerService = detectServiceFromHeader(sourceText);

        if (headerService != "") {
            addService(
                headerService,
                services,
                serviceMap
            );
        }
    }

    // それでもサービス名を取得できない場合は手入力
    if (services.length == 0) {
        var serviceInput = Editor.InputBox(
            "サービス（画面）名を入力してください。\r\n\r\n" +
            "例:\r\n" +
            "perl基盤（newmember）",
            "サービス名",
            0
        );

        if (
            serviceInput == null ||
            trimText(serviceInput) == ""
        ) {
            Editor.MessageBox(
                "サービス名を判定できなかったため中止しました。",
                0
            );
            return;
        }

        addService(
            trimText(serviceInput),
            services,
            serviceMap
        );
    }

    // サービスごと・キーワードごとに未ヒットを出力
    for (i = 0; i < services.length; i++) {
        var service = services[i];

        for (j = 0; j < keywords.length; j++) {
            var keyword = keywords[j];

            if (!hitMap[keyword][service]) {
                rows.push([
                    keyword,
                    "なし",
                    service,
                    "",
                    "",
                    ""
                ]);
            }
        }
    }

    if (rows.length == 0) {
        Editor.MessageBox(
            "出力対象がありませんでした。",
            0
        );
        return;
    }

    var tsv = makeTsv(rows);

    // 完成したTSVをクリップボードへコピー
    Editor.SetClipboard(0, tsv);

    Editor.MessageBox(
        "TSVをクリップボードへコピーしました。\r\n\r\n" +
        "出力行数: " + rows.length + "\r\n" +
        "解析したgrep結果: " + parsedCount + "行\r\n" +
        "対象サービス数: " + services.length + "\r\n" +
        "スキップ: " + skippedCount + "行\r\n\r\n" +
        "スプレッドシートのA列から貼り付けてください。",
        0
    );
}

// 現在のタブにある文書全体を取得
function getDocumentText() {
    Editor.SelectAll();
    return Editor.GetSelectedString(0);
}

// 検索文字列を解析
//
// 次のどちらでも入力可能:
// 会員証|初期契約解除|接続ID通知書
//
// または:
//
// 会員証
// 初期契約解除
// 接続ID通知書
function parseKeywords(value) {
    var normalized = String(value);

    normalized = normalized.replace(/\r\n/g, "\n");
    normalized = normalized.replace(/\r/g, "\n");
    normalized = normalized.replace(/\n/g, "|");

    var parts = normalized.split("|");
    var result = [];
    var seen = {};
    var i;

    for (i = 0; i < parts.length; i++) {
        var keyword = trimText(parts[i]);

        // 「会員証」などの引用符を除去
        keyword = keyword.replace(/^["'「『]+/, "");
        keyword = keyword.replace(/["'」』]+$/, "");
        keyword = trimText(keyword);

        if (keyword != "" && !seen[keyword]) {
            seen[keyword] = true;
            result.push(keyword);
        }
    }

    return result;
}

// grep結果の1行を解析
//
// 例:
// G:\...\fixed(app)_master_AP_...\app\sample.twig(10,2) [UTF-8]: 内容
function parseResultLine(line) {
    var match = String(line).match(
        /^(.+?\(\d+,\d+\)\s+\[[^\]]+\]:)[ \t]*(.*)$/
    );

    if (match == null) {
        return null;
    }

    var fullFileDisplay = match[1];
    var content = match[2];

    // _master_AP_... より前をサービス名として取得
    // それより後ろを相対パスとして取得
    var pathMatch = fullFileDisplay.match(
        /^(.*\\)([^\\]+)_master_AP_[^\\]+(\\.*)$/
    );

    if (pathMatch == null) {
        return null;
    }

    return {
        service: normalizeServiceName(pathMatch[2]),
        fileDisplay: pathMatch[3],
        content: content
    };
}

// サービス名を重複なしで追加
function addService(service, services, serviceMap) {
    if (service == "") {
        return;
    }

    if (!serviceMap[service]) {
        serviceMap[service] = true;
        services.push(service);
    }
}

// フォルダー行からサービス名を取得
//
// 例:
// フォルダー G:\...\fixed(package)_master_AP_00010110_20260801111910
function detectServiceFromFolderLine(line) {
    var match = String(line).match(
        /^\s*フォルダー\s+.*\\([^\\]+)_master_AP_[^\\\s]+/
    );

    if (match == null) {
        return "";
    }

    return normalizeServiceName(match[1]);
}

// スプレッドシート側と名前が異なるものを補正
function normalizeServiceName(service) {
    var mapping = {
        "scpf_mem_php(開発部分)": "scpf_mem_php（開発）"
    };

    if (mapping[service]) {
        return mapping[service];
    }

    return service;
}

// 1行に含まれる検索文字列をすべて取得
//
// 英字の大文字・小文字は区別しない
// 同じ行に複数含まれた場合はすべて返す
function findMatchedKeywords(content, keywords) {
    var result = [];
    var lowerContent = String(content).toLowerCase();
    var i;

    for (i = 0; i < keywords.length; i++) {
        var keyword = keywords[i];
        var lowerKeyword = String(keyword).toLowerCase();

        if (lowerContent.indexOf(lowerKeyword) >= 0) {
            result.push(keyword);
        }
    }

    return result;
}

// F列の内容を整形
//
// タブが残っているとスプレッドシートで別列に分裂するため、
// タブを半角スペースへ変換する
function cleanContent(value) {
    var result = String(value);

    result = result.replace(/\t+/g, " ");
    result = result.replace(/^\s+|\s+$/g, "");

    return result;
}

// 文書全体から最初のフォルダー行を探す予備処理
function detectServiceFromHeader(text) {
    var normalized = String(text);

    normalized = normalized.replace(/\r\n/g, "\n");
    normalized = normalized.replace(/\r/g, "\n");

    var lines = normalized.split("\n");
    var i;

    for (i = 0; i < lines.length; i++) {
        var service = detectServiceFromFolderLine(lines[i]);

        if (service != "") {
            return service;
        }
    }

    return "";
}

// grep結果のヘッダー行かどうかを判定
function isHeaderLine(line) {
    if (/^\s*□?検索条件/.test(line)) {
        return true;
    }

    if (/^\s*検索対象/.test(line)) {
        return true;
    }

    if (/^\s*フォルダー/.test(line)) {
        return true;
    }

    if (/^\s*除外ファイル/.test(line)) {
        return true;
    }

    if (/^\s*除外フォルダー/.test(line)) {
        return true;
    }

    if (/^\s*\(.*\)\s*$/.test(line)) {
        return true;
    }

    return false;
}

// 二次元配列をTSVへ変換
function makeTsv(rows) {
    var output = [];
    var i;
    var j;

    for (i = 0; i < rows.length; i++) {
        var cells = [];

        for (j = 0; j < rows[i].length; j++) {
            cells.push(
                sanitizeCell(rows[i][j])
            );
        }

        output.push(cells.join("\t"));
    }

    return output.join("\r\n");
}

// セル内のタブと改行を除去
function sanitizeCell(value) {
    if (value == null) {
        return "";
    }

    return String(value)
        .replace(/\r\n/g, " ")
        .replace(/[\r\n\t]/g, " ");
}

// 前後の空白を除去
function trimText(value) {
    return String(value).replace(/^\s+|\s+$/g, "");
}
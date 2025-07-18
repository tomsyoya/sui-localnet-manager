# Requirements Document

## Introduction

SUI ネットワークのテストネット環境を GUI 操作で起動・管理できる macOS デスクトップアプリケーション。開発者がコマンドライン操作なしで簡単に SUI テストネットワークの起動、停止、監視、設定変更を行えるツールを提供する。

## Requirements

### Requirement 1

**User Story:** 開発者として、GUI インターフェースを通じて SUI テストネットワークを起動したい。コマンドライン操作を覚える必要がなく、直感的に操作できるようにしたい。

#### Acceptance Criteria

1. WHEN ユーザーが「Start Network」ボタンをクリック THEN システム SHALL SUI テストネットワークを起動する
2. WHEN ネットワーク起動中 THEN システム SHALL 起動プロセスの進行状況を表示する
3. WHEN ネットワークが正常に起動完了 THEN システム SHALL 成功メッセージとネットワーク情報を表示する
4. IF ネットワーク起動に失敗 THEN システム SHALL エラーメッセージと解決方法を表示する

### Requirement 2

**User Story:** 開発者として、実行中の SUI テストネットワークを停止したい。安全にネットワークを終了し、データの整合性を保ちたい。

#### Acceptance Criteria

1. WHEN ユーザーが「Stop Network」ボタンをクリック THEN システム SHALL 確認ダイアログを表示する
2. WHEN ユーザーが停止を確認 THEN システム SHALL SUI テストネットワークを安全に停止する
3. WHEN ネットワーク停止中 THEN システム SHALL 停止プロセスの進行状況を表示する
4. WHEN ネットワークが完全に停止 THEN システム SHALL 停止完了メッセージを表示する

### Requirement 3

**User Story:** 開発者として、SUI テストネットワークの現在の状態を監視したい。ネットワークの健全性、接続状況、パフォーマンス指標をリアルタイムで確認したい。

#### Acceptance Criteria

1. WHEN ネットワークが実行中 THEN システム SHALL ネットワーク状態（実行中/停止中）を表示する
2. WHEN ネットワークが実行中 THEN システム SHALL 接続されたノード数を表示する
3. WHEN ネットワークが実行中 THEN システム SHALL 最新ブロック高を表示する
4. WHEN ネットワークが実行中 THEN システム SHALL トランザクション処理数を表示する
5. WHEN ネットワーク状態が変化 THEN システム SHALL 表示情報を自動更新する

### Requirement 4

**User Story:** 開発者として、SUI テストネットワークの設定を変更したい。ポート番号、ノード数、初期残高などの設定を GUI で調整したい。

#### Acceptance Criteria

1. WHEN ユーザーが設定画面を開く THEN システム SHALL 現在の設定値を表示する
2. WHEN ユーザーがポート番号を変更 THEN システム SHALL 有効なポート範囲内での入力を検証する
3. WHEN ユーザーがノード数を変更 THEN システム SHALL 1 以上の整数値での入力を検証する
4. WHEN ユーザーが設定を保存 THEN システム SHALL 設定ファイルを更新する
5. IF ネットワークが実行中に設定変更 THEN システム SHALL 再起動が必要な旨を通知する

### Requirement 5

**User Story:** 開発者として、SUI テストネットワークのログを確認したい。問題の診断やデバッグのために詳細なログ情報にアクセスしたい。

#### Acceptance Criteria

1. WHEN ユーザーがログ画面を開く THEN システム SHALL 最新のネットワークログを表示する
2. WHEN 新しいログエントリが生成 THEN システム SHALL ログ表示を自動更新する
3. WHEN ユーザーがログレベルを選択 THEN システム SHALL 指定レベル以上のログのみを表示する
4. WHEN ユーザーがログを検索 THEN システム SHALL キーワードに一致するログエントリを強調表示する
5. WHEN ユーザーがログをエクスポート THEN システム SHALL ログをファイルに保存する

### Requirement 6

**User Story:** 開発者として、複数のテストネット設定プロファイルを管理したい。異なる開発シナリオに応じて設定を切り替えたい。

#### Acceptance Criteria

1. WHEN ユーザーが新しいプロファイルを作成 THEN システム SHALL プロファイル名と設定を保存する
2. WHEN ユーザーがプロファイルを選択 THEN システム SHALL 対応する設定を読み込む
3. WHEN ユーザーがプロファイルを削除 THEN システム SHALL 確認後にプロファイルを削除する
4. WHEN ユーザーがプロファイルを複製 THEN システム SHALL 既存設定をコピーした新プロファイルを作成する
5. IF アクティブなプロファイルを削除しようとする THEN システム SHALL 警告メッセージを表示する

### Requirement 7

**User Story:** 開発者として、アプリケーション起動時に SUI テストネットがシステムにインストールされているか確認してほしい。インストールされていない場合はインストール手順を提供してほしい。

#### Acceptance Criteria

1. WHEN アプリケーションが起動 THEN システム SHALL SUI テストネットがインストールされているか確認する
2. IF SUI テストネットがインストールされている THEN システム SHALL SUI のソースコードが配置されているパスの入力を求める
3. WHEN ユーザーが SUI のパスを入力 THEN システム SHALL パスの有効性を検証する
4. IF 入力されたパスが有効 THEN システム SHALL パス情報を設定に保存する
5. IF SUI テストネットがインストールされていない THEN システム SHALL インストール手順を表示する
6. WHEN インストール手順が表示されている THEN システム SHALL ユーザーがインストールを完了したことを確認するオプションを提供する
7. WHEN ユーザーがインストール完了を確認 THEN システム SHALL 再度 SUI テストネットの存在を確認する

### Requirement 8

**User Story:** 開発者として、SUI の新しいバージョンがリリースされた時に、ワンクリックでアップデートしたい。バージョン管理を自動化し、常に最新の機能を利用したい。

#### Acceptance Criteria

1. WHEN アプリケーション起動時 THEN システム SHALL SUI の最新バージョンを確認する
2. IF 新しいバージョンが利用可能 THEN システム SHALL アップデート通知を表示する
3. WHEN ユーザーがアップデートを実行 THEN システム SHALL 自動的に SUI をアップデートする
4. WHEN アップデート中 THEN システム SHALL プロセスの進行状況を表示する
5. WHEN アップデート完了 THEN システム SHALL 成功通知を表示する
6. IF アップデートに失敗 THEN システム SHALL エラーメッセージと手動アップデート手順を表示する

### Requirement 9

**User Story:** 開発者として、アプリケーションが必要とする権限について明確に理解し、後から設定を変更したい。セキュリティを意識しながら適切な権限管理を行いたい。

#### Acceptance Criteria

1. WHEN 権限が必要な操作を初回実行 THEN システム SHALL 権限要求ダイアログを表示する
2. WHEN 権限要求ダイアログが表示 THEN システム SHALL 権限が必要な理由を説明する
3. WHEN ユーザーが権限を許可 THEN システム SHALL 権限設定を保存する
4. WHEN ユーザーが設定画面を開く THEN システム SHALL 現在の権限状態を表示する
5. WHEN ユーザーが権限設定を変更 THEN システム SHALL 変更を適用し再起動が必要な場合は通知する

### Requirement 10

**User Story:** 開発者として、アプリケーションの外観をカスタマイズしたい。ダークモード・ライトモードを切り替えて、作業環境に合わせた見た目にしたい。

#### Acceptance Criteria

1. WHEN ユーザーが設定画面を開く THEN システム SHALL テーマ選択オプションを表示する
2. WHEN ユーザーがダークモードを選択 THEN システム SHALL UI をダークテーマに変更する
3. WHEN ユーザーがライトモードを選択 THEN システム SHALL UI をライトテーマに変更する
4. WHEN ユーザーがシステム設定連動を選択 THEN システム SHALL macOS のシステム設定に合わせてテーマを変更する
5. WHEN テーマが変更 THEN システム SHALL 設定を永続化する

### Requirement 11

**User Story:** 開発者として、重要なネットワーク状態の変化を見逃したくない。システム通知を通じて適切なタイミングで情報を受け取りたい。

#### Acceptance Criteria

1. WHEN ネットワークが正常に起動 THEN システム SHALL システム通知を表示する
2. WHEN ネットワークが停止 THEN システム SHALL システム通知を表示する
3. WHEN ネットワークエラーが発生 THEN システム SHALL エラー通知を表示する
4. WHEN ユーザーが通知設定画面を開く THEN システム SHALL 通知の ON/OFF を設定できる
5. WHEN ユーザーが通知を無効化 THEN システム SHALL 該当する通知を停止する

## Technical Architecture

### Technology Stack

- **フレームワーク**: Electron + TypeScript
- **理由**: 開発者間でのシェアしやすさ、動作確実性、豊富なエコシステム
- **UI ライブラリ**: React + Material-UI または同等のコンポーネントライブラリ
- **プロセス管理**: Node.js child_process での SUI コマンド実行
- **設定管理**: JSON ベースの設定ファイル管理

### File Structure

```
~/Library/Application Support/SUILocalnetManager/
├── config/
│   ├── app-settings.json          # アプリケーション全体設定
│   ├── profiles/                  # ネットワークプロファイル
│   │   ├── default.json
│   │   ├── development.json
│   │   └── testing.json
│   └── sui-config/               # SUI設定ファイル管理
│       ├── client.yaml
│       └── network.yaml
├── logs/                         # アプリケーションログ
└── cache/                        # 一時データ・キャッシュ
```

### Key Integration Points

1. **SUI コマンド統合**: `sui start`, `sui-test-validator` などのコマンドを child_process で実行
2. **設定ファイル管理**: YAML/JSON ファイルを GUI で編集可能にする
3. **リアルタイム監視**: SUI プロセスの stdout/stderr を監視してステータス更新
4. **権限管理**: macOS の権限要求システムとの連携

# quickchart 実装計画

本書は `doc/spec.md` を入力として、MVP実装をどの順序で進めるかを定める。各フェーズは「動く状態」で終えることを原則とし、後続フェーズが前提とする機能が揃った時点で次に進む。フェーズ内の項目番号は実装順の目安であり、厳密な依存関係がない項目は前後してよい。

## 進め方の方針

- 技術的に不確実性が高い箇所(GDI経由のEMF生成、resvgでの日本語フォント埋め込み)は、機能を作り込む前にフェーズ0で最小構成の技術検証(スパイク)を行い、致命的な問題がないかを先に潰す。
- 各フェーズの終わりに `npm run tauri dev` で実際に動作確認する。フェーズ7以降は構造化テンプレート機能ごとに要求仕様3.2の対象パターンが1つずつ動くようになる。
- Undo/Redo(フェーズ3)は自由配置キャンバス操作の後、構造化テンプレート生成(フェーズ7)の前に導入する。テンプレート生成の「1操作1パッチ」(spec §4)を最初から正しく設計するため。

## フェーズ0: 環境構築・技術検証スパイク

**目的**: プロジェクトの雛形を用意し、設計上もっともリスクの高い2点を早期に検証する。

- Tauri + React + TypeScript プロジェクトを初期化し、spec §2 のディレクトリ雛形(空ファイル可)を作成する。
- Vitest / React Testing Library / `cargo test` の実行環境を整える。
- **スパイクA(EMF)**: `windows-rs` で `CreateEnhMetaFile` → `Rectangle` 1個描画 → `CloseEnhMetaFile` → `.emf` ファイル保存、を行う最小コードを書き、実際にPowerPointに配置して「図形としてUngroup編集できるか」を確認する。`SetClipboardData(CF_ENHMETAFILE, ...)` によるクリップボード貼り付けも合わせて検証する。
- **スパイクB(PNG/日本語フォント)**: `resvg` で日本語テキストを含むSVGをPNGにラスタライズし、文字化け・フォント埋め込みの問題がないか確認する。
- **完了基準**: 上記2スパイクのコードが単体で動作し、PowerPoint上での見た目・編集可否を目視確認できていること。問題が見つかった場合は spec §8.3 の方式を見直してから先に進む。

## フェーズ1: 図形モデル・自由配置キャンバス基盤

**対象**: `core/model/shape.ts`, `core/model/document.ts`, `core/store/documentStore.ts`, `components/canvas/Canvas.tsx`, `components/canvas/ShapeRenderer.tsx`, `components/panels/ToolPanel.tsx`

- `Shape`/`Document` 型(spec §3.1, 3.2。ただし `structuredBlocks` はフェーズ7まで未使用の空配列でよい)を実装。
- Zustand の `documentStore` を作成し、図形の追加・移動・削除の基本アクションを実装(Undo/Redo未対応の状態でよい)。
- `Canvas.tsx` でパン・ズーム、`ShapeRenderer.tsx` で矩形・楕円・直線・テキストを描画。
- `ToolPanel.tsx` からツールを選んでキャンバス上に基本図形を配置できるようにする。

**完了基準**: 矩形・楕円・直線・テキストボックスを配置し、ドラッグで移動できる。

## フェーズ2: 選択・変形・整列・グルーピング

**対象**: `components/canvas/SelectionOverlay.tsx`, `components/canvas/GuidesAndSnap.tsx`, `core/layout/snap.ts`, `core/layout/align.ts`, `components/panels/PropertyPanel.tsx`

- `react-moveable` を使った選択・リサイズ・回転を実装。
- `snap.ts`/`align.ts` を純関数として実装し、ユニットテストを書く(spec §5, §13)。
- グリッドスナップ・ガイド線・整列/分布・グルーピング(`groupId`)・レイヤー順序(最前面/最背面等)・複製・コピー&ペーストを実装。
- `PropertyPanel.tsx` に位置・サイズの数値表示/編集を実装。

**完了基準**: 図形の選択・変形・整列・グルーピング・複製が一通り操作できる。

## フェーズ3: Undo/Redo

**対象**: `core/store/historyMiddleware.ts`, `components/toolbar/Toolbar.tsx`

- Immer の `produceWithPatches` を使い、`documentStore` の全更新操作に対して `patches`/`inversePatches` をスタックする仕組みを実装(spec §4)。
- `selectionStore` は対象外とする。
- Toolbarに Undo/Redo ボタン、キーボードショートカット(Ctrl+Z / Ctrl+Y)を実装。
- テスト: 複数操作→Undo連打→Redo連打で状態が一致することを検証(spec §13)。

**完了基準**: フェーズ1・2で実装した全操作がUndo/Redoできる。

## フェーズ4: スタイル・配色プリセット

**対象**: `core/model/style.ts`, `components/panels/PropertyPanel.tsx`, `styles/theme.css`

- 塗り色・線色・線太さ・線種・フォント・文字サイズ・文字色・配置を `PropertyPanel.tsx` から編集可能にする。
- `ColorTheme` 3プリセット(Neutral Blue / Warm Gray / Monochrome、spec §7)を実装し、テーマ切り替えUIを用意する。
- 「書式のコピペ」を `selectionStore` 経由で実装する。

**完了基準**: 図形のスタイルを変更・プリセット適用・コピペできる。

## フェーズ5: コネクタ

**対象**: `components/canvas/ConnectorRenderer.tsx`, `core/model/shape.ts`(`ConnectorShape`)

- コネクタ/矢印の作成、図形へのアンカー接続、接続先移動への追従を実装(spec §5、直線接続のみ)。
- コネクタの選択・スタイル変更・Undo/Redo対応(フェーズ3の仕組みに乗せる)。

**完了基準**: 図形同士をコネクタ/矢印で接続し、図形移動にコネクタが追従する。この時点で要求仕様3.2の「汎用フローチャート」「因果関係図」(汎用パーツ+コネクタで対応)がMVPとして作図可能になる。

## フェーズ6: プロジェクト管理(保存・読込)

**対象**: `src-tauri/src/commands/project.rs`, `src-tauri/src/project_file.rs`, `src-tauri/src/recent_files.rs`, `core/io/projectFile.ts`, `core/io/tauriApi.ts`, `components/toolbar/Toolbar.tsx`

- Rust側: `Document` に対応する serde 構造体、`.qct` ファイルの読み書き、`project_new`/`project_open`/`project_save`/`project_save_as`/`get_recent_files` コマンド(spec §10)。
- `AppError`(`thiserror`)とIPCエラーのシリアライズ(spec §11)をこの段階で導入する(以降の全コマンドが利用するため)。
- フロントエンド: `tauriApi.ts` 経由の呼び出しラッパー、失敗時のトースト通知、`projectFile.ts` のシリアライズ/デシリアライズと `migrateDocument` の骨組み(`formatVersion` は現時点で1固定でよい)。
- Toolbarに新規作成・開く・保存・名前を付けて保存・直近使用ファイル一覧を実装。

**完了基準**: フェーズ1〜5で作成した図形をファイルに保存し、再度開いて復元できる。`cargo test` でシリアライズ/デシリアライズの往復一致を検証する(spec §13)。

## フェーズ7: 構造化テンプレート基盤 + ピラミッド/ロジックツリー

**対象**: `core/model/document.ts`(`OutlineNode`/`StructuredBlock`)、`core/templates/outlineParser.ts`, `core/templates/outlineSerializer.ts`, `core/templates/sync.ts`, `core/templates/pyramid.ts`, `core/templates/logicTree.ts`, `components/panels/StructuredTextPanel.tsx`, `components/panels/TemplateLibraryPanel.tsx`

- `StructuredBlock`/`OutlineNode` をデータモデルに追加。
- `StructuredTextPanel.tsx` を行単位の構造化アウトラインエディタとして実装(`addSibling`/`addChild`/`indent`/`outdent`/`deleteNode` 操作、spec §6.1)。
- `outlineParser.ts`(貼り付けインポート用)、`outlineSerializer.ts`(テキストへの書き出し用)を純関数として実装。
- `pyramid.ts`/`logicTree.ts` で木構造→図形レイアウトを実装。
- `sync.ts` で双方向同期(ラベル編集の相互反映、ノード追加/削除時の図形生成・削除ルール、spec §6.3)を実装し、構造化テンプレートの一括生成/更新を1回のUndo単位にまとめる(フェーズ3の `historyMiddleware` を利用)。
- `TemplateLibraryPanel.tsx` から「パターン選択→階層テキスト入力→自動レイアウト生成」のフローを実装。

**完了基準**: ピラミッド・ロジックツリーを階層テキストから生成し、アウトライン⇄図形のラベル双方向同期、ノード追加/削除、Undo/Redoが一通り動作する。境界値(空入力・ノード1個)のユニットテストを実装する(spec §13)。

## フェーズ8: マトリクス・ベン図

**対象**: `core/templates/matrix.ts`, `core/templates/venn.ts`, `components/panels/StructuredTextPanel.tsx`(拡張)

- `matrix.ts`: 4象限固定のレイアウト、軸ラベル(`axisXLabel`/`axisYLabel`)専用入力欄、5件目以降のルート追加をUIで無効化+生成ロジック側でも防御的に無視(spec §6.2.1)。
- `venn.ts`: 2〜3集合の円配置・重なり領域代表点の事前計算、要素のテキスト一致によるグルーピング、`templateNodeIds` の多対1対応、所属集合変化時の位置再計算(spec §6.2.2)。`params.setCount` に連動したルート数のUI制約。
- 境界値テスト: マトリクス5象限目以降の無視、ベン図の3集合共通要素・同一集合内重複・所属集合変化ケース(spec §13)。

**完了基準**: マトリクス・ベン図が階層テキストから生成でき、要求仕様3.2のMVP優先4パターン(マトリクス・ピラミッド・ロジックツリー・ベン図)がすべて完成する。

## フェーズ9: ユーザーテンプレート登録

**対象**: `src-tauri/src/user_templates.rs`, `core/model/userTemplate.ts`, `components/panels/TemplateLibraryPanel.tsx`(マイテンプレートタブ)、`components/panels/PropertyPanel.tsx`(登録操作)

- Rust側: `user_templates.json` の読み書きと `get_user_templates`/`save_user_template`/`delete_user_template` コマンド(spec §6.4, §10)。
- フロントエンド: 選択図形群の相対座標への正規化・登録、一覧表示、配置時の絶対座標への変換・新規シェイプID採番。
- テスト: 座標正規化→配置の往復変換を検証(spec §13)。

**完了基準**: よく使う図形の組み合わせをテンプレート登録し、別プロジェクトでも再利用できる(要求仕様4.4完全対応)。

## フェーズ10: エクスポート本実装(SVG/PNG/EMF)

**対象**: `core/io/`(SVGシリアライズ)、`src-tauri/src/commands/export_png.rs`, `src-tauri/src/commands/export_emf.rs`, `src-tauri/src/emf/writer.rs`, `src-tauri/src/emf/shape_draw.rs`, `src-tauri/src/clipboard.rs`

- フェーズ0のスパイクを本実装に発展させる。
- SVGエクスポート: `Document` からSVG文字列を組み立て、`export_svg` コマンドでファイル書き込み。
- PNGエクスポート: `export_png` コマンドで resvg ラスタライズ(解像度指定対応)。
- EMFエクスポート: `shape_draw.rs` でフェーズ1〜8で実装した全図形種別(矩形・楕円・直線・矢印・コネクタ・テキスト)をGDI描画命令に変換。`export_emf_to_file`/`export_emf_to_clipboard` コマンド、GDI失敗時のPNGクリップボードフォールバック(spec §8.3)。
- `shape_draw.rs` のShape→GDI描画命令列変換ロジックを `cargo test` で検証(GDI呼び出し自体を除く、spec §13)。

**完了基準**: SVG/PNG/EMF(ファイル・クリップボード双方)へのエクスポートが動作し、PowerPointに貼り付けた図形が編集可能であることを手動確認する。

## フェーズ11: 仕上げ

- エラーハンドリングの全体レビュー(spec §11のとおり、失敗時にUndo履歴・アプリ状態が壊れないことを再確認)。
- パフォーマンス確認: 数十〜百オブジェクト規模での動作を手動確認(spec §12、数値目標なし)。
- パッケージング: `tauri.conf.json` の `version` を単一の真実源とするビルドスクリプトの整備(spec §14)。
- `README.md` 作成(要求仕様のREADME作成タスクに対応)。

**完了基準**: MVPスコープ(要求仕様3.1〜3.2)を満たし、`doc/README.md` から一通りの使い方を辿れる状態。

## フェーズ12: 複数タブ対応データモデル・状態管理

**対象**: `core/model/document.ts`, `core/model/project.ts`(新規), `core/io/projectFile.ts`, `core/io/tauriApi.ts`, `core/store/documentStore.ts`, `core/store/selectionStore.ts`, `core/store/structuredEditorStore.ts`

要求仕様4.7・spec §3.2〜3.3, §4.1 に対応する。このフェーズではまだタブ操作のUIは作らず、データモデルとストアの土台のみを固める(フェーズ13で配線する)。`historyMiddleware.ts`(`DocumentHistory<T>`)自体はジェネリックなクラスのため変更不要。

- `Document` から `formatVersion` を削除し、`core/model/project.ts` に `DocumentTab`/`ProjectFile` 型と `createEmptyProjectFile()` を新設する(spec §3.2, §3.3)。
- `core/io/projectFile.ts`: `serializeProjectFile`/`deserializeProjectFile` を実装する。`deserializeProjectFile` は `tabs` フィールドの有無で旧形式(単一 `Document`、`formatVersion: 1`)を判定し、既存の `migrateDocument` を通した上で単一タブの `ProjectFile`(`formatVersion: 2`)に変換する(spec §3.3)。
- `core/io/tauriApi.ts`: `OpenResult` の `document` フィールドを `projectFile: ProjectFile` にリネームし、`projectSave`/`projectSaveAs` が `ProjectFile` を受け取るようにする(IPCの引数名・JSONキー自体は `document` のまま変更しない。Rust側は無変更、spec §10注記)。
- `core/store/documentStore.ts` を `tabs: DocumentTabState[]` + `activeTabId` 構成に書き換える(spec §4.1)。
  - `change()` ヘルパーがアクティブタブの `id` で `Map<tabId, DocumentHistory<Document>>` を引いて、そのタブの `document` にのみ recipe を適用するようにする。
  - `document`/`canUndo`/`canRedo` はアクティブタブから導出される値として維持し、既存の図形/構造化テンプレート操作アクション(`addShape` 等)のシグネチャは一切変更しない。
  - `newProject`/`loadProject`/`buildProjectFile`/`markSaved`/`isDirty`、および `addTab`/`closeTab`/`switchTab`/`renameTab`/`reorderTabs` を実装する。
- `switchTab`/`newProject`/`loadProject` の呼び出し側で `selectionStore`/`structuredEditorStore` をクリアする配線は、呼び出し元(Toolbar/TabBar)を実装するフェーズ13側で行う(このフェーズでは各ストアの `clear()`/`setActiveBlockId(null)` 自体は変更不要)。

**完了基準**: 以下をユニットテストで検証できる(spec §13)。
- タブを追加→切り替え→別タブで編集→元のタブに戻ると編集前の内容のままである。
- タブごとのUndo/Redoが独立している(タブAで操作→タブBに切り替えてUndoしてもタブAの内容は変化しない)。
- `closeTab` はタブが1枚のときは何もしない。
- `isDirty` が変更操作(`change()`/`commitGesture()`/タブ操作)で `true` になり、`markSaved`/`newProject`/`loadProject` で `false` に戻る。
- 旧形式(`tabs` フィールドなしの `Document`)ファイルの読み込みが単一タブの `ProjectFile` に変換される(往復テスト)。
この時点では `App.tsx` 等の既存コンポーネントはコンパイルが通る最小限の追従(`document` セレクタ等の呼び出し方は変えない)にとどめ、タブのUI配線はまだ行わない。

## フェーズ13: タブバーUI・保存/オープンの未保存確認フロー

**対象**: `components/tabs/TabBar.tsx`(新規), `components/common/ConfirmDialog.tsx`(新規), `components/toolbar/Toolbar.tsx`, `App.tsx`, `styles/theme.css`

フェーズ12で用意した状態管理をUIに配線する(spec §5.2, §9.2)。フェーズ12が完了していること(`documentStore` のタブAPIが揃っていること)が前提。

- `ConfirmDialog.tsx`: タイトル・メッセージ・ボタン定義(ラベル+戻り値)を受け取る汎用の確認モーダルを実装する。
- `TabBar.tsx`: `tabs` の一覧表示・クリックでの切り替え・×ボタンでの削除(1枚のみのときは非活性)・ダブルクリックでのインライン名前変更・HTML5 Drag and Drop APIでの並べ替え・「+」ボタンでの追加を実装し、`App.tsx` の `Toolbar` と `Canvas` の間に配置する(spec §5.2)。
- `App.tsx`: 既存のグローバル `handleKeyDown` に `Ctrl+T`(タブ追加)・`Ctrl+Tab`/`Ctrl+Shift+Tab`(次/前のタブへ切り替え、循環)・`Ctrl+W`(アクティブタブを閉じる)を追加する。`TabBar.tsx` からのタブ切り替え(クリック・ショートカットいずれも)で `useSelectionStore.getState().clear()` と `useStructuredEditorStore.getState().setActiveBlockId(null)` を呼ぶ(spec §4.1)。
- `Toolbar.tsx`: `handleSave` を「保存できたか」を `boolean` で返すように変更する(ネイティブ保存ダイアログのキャンセル = `dialog_cancelled` エラーは `false` として扱う)。`withUnsavedChangesGuard` を実装し、`handleNew`/`handleOpen`/`handleOpenRecent` の3操作に適用する(spec §9.2)。`handleSave`/`handleSaveAs` は `buildProjectFile()`/`markSaved()` を使うよう更新する。`loadProject()` 呼び出し時にも selectionStore/structuredEditorStore のクリアを行う。

**完了基準**: タブの追加・切替・削除・名前変更・並べ替えがUIから一通り操作できる。未保存の変更がある状態で「新規作成」「開く」「直近使用ファイル」のいずれかを行うと3択(保存する/保存しない/キャンセル)の確認が表示され、選択どおりに動作する。未保存の変更がなければ確認なしに即座に切り替わる。

## フェーズ14: 手動動作確認・最終確認(複数タブ編集機能)

フェーズ12・13の内容を、`doc/requirement.md` §4.7 の記述と実際に突き合わせる。

- `npm run tauri dev` で起動し、以下を手順どおりに確認する。
  1. 新規作成直後はタブが1つ(空の図)であること。
  2. 「+」でタブを追加し、それぞれ別の構造化テンプレート(例: ガントチャートとマトリクス)を配置する。タブの切り替えで表示内容が正しく入れ替わること。
  3. タブ名をダブルクリックで変更できること。タブをドラッグして順序を入れ替えられること。
  4. 「名前を付けて保存」で `.qct` に保存し、「新規作成」→「開く」でそのファイルを開き直す。タブの数・順序・名前・各タブの内容・アクティブタブが保存前と一致していること。
  5. いずれかのタブを編集した状態(未保存)で「新規作成」を実行し、「保存する」「保存しない」「キャンセル」それぞれの選択で§4.7どおりの挙動になることを確認する(保存する→保存後に新規プロジェクトへ切り替わる、保存しない→変更を破棄して切り替わる、キャンセル→何も起きず編集を継続できる)。同様の確認を「開く」「直近使用ファイル」からの再オープンでも行う。
  6. タブが1枚だけの状態で×ボタン・`Ctrl+W` を試し、タブが閉じられない(無視される)ことを確認する。
  7. 本機能導入前の形式(単一 `Document` 直下、`tabs` フィールドなし)の `.qct` ファイルを用意して開き、単一タブとして正しく復元されることを確認する。
- **最終確認**: `npm test`(Vitest)・`cargo test` が全件成功すること。`doc/requirement.md` §4.7 の各箇条を上記手順ですべて突き合わせたことを確認する。

## フェーズ15〜20: 要求仕様レビュー指摘への対応

要求仕様のレビューで追加・明確化した要求に対応する(要求仕様 4.1・4.5・4.7、spec §4.1, §5, §5.2〜5.4, §8, §9.3)。エクスポート対象を「アクティブなタブのみ」とする要求(要求仕様 4.5、spec §8)は実装済みのため、このフェーズ群では扱わず、フェーズ20の手動動作確認で突き合わせるのみとする。

**依存関係**: フェーズ15〜19は互いに独立しており、どの順で進めても並行して進めてもよい。ただし次の2点に注意する。
- フェーズ16(`App.tsx`/`TabBar.tsx`)とフェーズ17(`Toolbar.tsx`/capabilities)は触るファイルが重ならないが、どちらも確認ダイアログ(`ConfirmDialog.tsx`)を使うため、`ConfirmDialog.tsx` 自体に変更が必要になった場合は先に済ませた方に合わせる。
- フェーズ20(手動動作確認・最終確認)はフェーズ15〜19がすべて終わってから行う。

## フェーズ15: 複製・貼り付け時の図形の複製規則(タブをまたぐコピー&ペースト)

**対象**: `core/model/shapeClone.ts`(新規), `core/store/documentStore.ts`

spec §4.1「複製・貼り付け時の図形の複製規則」に対応する。`clipboard` はすでにタブ非依存のため、タブをまたいだ貼り付け自体は動くが、元の図形への参照(`templateNodeIds`、コネクタの接続先)を持ち越してしまう問題を直す。

- `shapeClone.ts` に次の純関数を実装する。
  - `detachExternalConnections(shapes: Shape[], sourceShapes: Record<ShapeId, Shape>): Shape[]`: `shapes` 内のコネクタ/矢印について、接続先が `shapes` に含まれない端点を外し、`resolveEndpoint`(`ConnectorRenderer.tsx`)で求めた現在の絶対座標を `points` に書き込む。接続先が `shapes` に含まれる端点はそのまま残す。
  - `cloneShapesInto` を `documentStore.ts` から `shapeClone.ts` へ移し、2パス処理に書き換える(1パス目で旧ID→新IDの対応表を作り、2パス目で複製)。複製時に `templateNodeIds` を `undefined` にし、コネクタの `fromShapeId`/`toShapeId` を対応表で新IDに付け替える。`groupId` の付け替え・(+20, +20)のずらし・`zIndex` の採番は現状を踏襲する。
- `resolveEndpoint` は `ConnectorRenderer.tsx`(コンポーネントのファイル)にあるため、`core/` から参照できるよう既存の `core/layout/connector.ts`(`anchorPosition` と同じ場所)へ移し、`ConnectorRenderer.tsx`・`Canvas.tsx`・`svgExport.ts` はそれを import する形にする。
- `documentStore.ts`:
  - `copyShapes`: 選択図形を `detachExternalConnections(選択図形, state.document.shapes)` で正規化してから `clipboard` に保持する。
  - `duplicateShapes`: 複製の直前に同じ関数を通す。
  - `pasteClipboard`: 移動後の `cloneShapesInto` を使う(呼び出し方は変えない)。
- `clipboard` を `newProject`/`loadProject` でのみ空にし、`switchTab`/`addTab`/`closeTab` では保持していることを確認する(現状どおりのはずだが、テストで固定する)。

**完了基準**: 以下をユニットテストで検証できる(spec §13)。
- 構造化テンプレート由来の図形をコピーして別タブに貼り付けると、`templateNodeIds` を持たない図形になり、貼り付け先・貼り付け元どちらのブロックの `generatedShapeIds` も変化しない。同じタブ内の複製・貼り付けでも同様。
- 図形A・Bとそれをつなぐコネクタをまとめてコピー&ペーストすると、貼り付けたコネクタは貼り付けたA'・B'につながっている。
- 図形Aとコネクタのみをコピー(接続先Bはコピーしない)して貼り付けると、B側の端点はコピー時点のBのアンカー位置(+20, +20)を持つ自由端点になる。
- `switchTab` をはさんでも `clipboard` が保持され、別タブに貼り付けられる。

## フェーズ16: タブを閉じる際の確認

**対象**: `core/store/tabCloseStore.ts`(新規), `components/tabs/TabBar.tsx`, `App.tsx`

spec §5.2「タブを閉じる際の確認」に対応する。

- `tabCloseStore.ts`: `pendingTabId`/`requestCloseTab(id)`/`resolvePending(choice)` を持つ Zustand ストアを実装する。`requestCloseTab` は、タブが1枚なら何もしない、対象タブの図形が0個なら `useDocumentStore.getState().closeTab(id)` を直接呼ぶ、1個以上なら `pendingTabId` を設定する。
- `TabBar.tsx`: ×ボタンの `handleClose` を `requestCloseTab(id)` 呼び出しに置き換える。`pendingTabId !== null` のとき `ConfirmDialog` を表示する(文言「タブ「<タブ名>」を閉じますか？ タブの内容は元に戻せません。」、ボタン「閉じる」「キャンセル」)。「閉じる」で `resolvePending("close")` の後に `resetActiveTabUiState()` を呼ぶ。確認なしで閉じた場合も `resetActiveTabUiState()` を呼ぶ。
- `App.tsx`: `Ctrl+W` の処理を `store.closeTab(...)` から `requestCloseTab(store.activeTabId)` に置き換える。`handleKeyDown` の先頭で、`pendingTabId !== null` のときはすべてのショートカットを無視する。
- `closeTab` 自体は変更しない。

**完了基準**:
- ユニットテスト(spec §13): 図形0個のタブは確認なしに閉じる。図形を含むタブは `pendingTabId` が設定されるだけでタブが残る。`resolvePending("close")` で閉じ、`"cancel"` で残る。タブが1枚のときは何もしない。
- `npm run tauri dev` で、図形を含むタブの×ボタン・`Ctrl+W` の両方で確認ダイアログが出て、空のタブは確認なしに閉じることを確認する。

## フェーズ17: アプリ終了時の未保存確認

**対象**: `components/toolbar/Toolbar.tsx`, `src-tauri/capabilities/default.json`

spec §9.3 に対応する。

- `src-tauri/capabilities/default.json` の `permissions` に `core:window:allow-destroy` を追加する。
- `Toolbar.tsx`:
  - 最新の `withUnsavedChangesGuard` を指す `guardRef`(`useRef`)を用意し、毎レンダーで更新する。
  - `useEffect` で `getCurrentWindow().onCloseRequested` を1回だけ登録する。`isDirty` が `false` なら何もしない(そのまま閉じる)。`true` なら `event.preventDefault()` の後に `guardRef.current(() => appWindow.destroy())` を呼ぶ。アンマウント時にリスナーを解除する。
  - 確認ダイアログ表示中(`confirmResolve !== null`)に再度閉じる要求が来た場合は、`preventDefault()` だけ行って return する。
- `npm run dev`(Vite単体、Tauri外)で起動した場合に `getCurrentWindow()` が例外を投げてもアプリ全体が止まらないよう、登録処理を try/catch で囲む(README記載のとおり、Vite単体起動ではRust連携機能は動作しない前提)。

**完了基準**: 手動で確認する(ウィンドウAPIに依存するため自動テストの対象外、spec §13)。`npm run tauri dev` で起動し、下記フェーズ20の手順4を満たす。`npx tsc --noEmit` が通る。

## フェーズ18: 整列ガイド線

**対象**: `core/layout/guides.ts`(新規), `components/canvas/Canvas.tsx`, `components/canvas/GuidesAndSnap.tsx`

spec §5.3 に対応する。

- `guides.ts`: `computeAlignmentGuides(moving, others, threshold)` を純関数として実装する(x軸は左端・中心・右端、y軸は上端・中心・下端の全組み合わせから、しきい値以内で最も近いものを採用し、補正量とガイド線を返す)。
- `Canvas.tsx` の `handlePointerMove`(図形のドラッグ移動):
  - 移動対象の図形群全体のバウンディングボックス(移動量を足した後)と、移動対象以外の図形のバウンディングボックス一覧を求め、`computeAlignmentGuides(..., 6 / viewport.scale)` を呼ぶ。
  - ガイドに吸着した軸は補正量を全移動対象に足し、その軸のグリッドスナップ(`snapValue`)は行わない。吸着しなかった軸は従来どおりグリッドに吸着する。
  - 結果のガイド線をローカル state `guideLines` に保持し、`handlePointerUp` で空にする。
- `GuidesAndSnap.tsx`: `guideLines` を props で受け取り、図形より前面に細い実線(`SELECTION_COLOR`、`pointerEvents="none"`)で描画する。グリッドの背景描画と前面のガイド線描画で描画位置(図形グループの前か後か)が異なるため、必要ならガイド線描画を別コンポーネントに分けて `Canvas.tsx` の図形グループの後に置く。

**完了基準**:
- ユニットテスト(spec §13): しきい値以内の端・中心の一致を検出して補正量とガイド線を返す。しきい値を超える場合は補正しない。複数候補があるときは最も近いものを選ぶ。
- `npm run tauri dev` で、図形をドラッグして別の図形の左端・中心・右端(上端・中心・下端)に近づけると吸着してガイド線が表示され、離すとガイド線が消えることを確認する。

## フェーズ19: 角丸矩形の設定UI・EMF出力

**対象**: `components/panels/PropertyPanel.tsx`, `src-tauri/src/emf/shape_draw.rs`, `src-tauri/src/emf/writer.rs`

spec §5(角丸矩形)・§8.3 に対応する。

- `PropertyPanel.tsx`: 矩形(`type: "rect"`)を単一選択しているときに「角丸」の数値入力欄を表示し、`cornerRadius` を更新する(0以上、`min(width, height) / 2` を上限にクランプ)。更新は既存のスタイル・位置変更と同じく Undo/Redo の対象にする。
- `shape_draw.rs`: 矩形の `BoxCommand`(またはその Rect 用の変種)に `corner_radius`(フロントエンドの `cornerRadius`、未指定は0)を持たせる。
- `writer.rs`: `corner_radius > 0` のとき `Rectangle` の代わりに `RoundRect(hdc, left, top, right, bottom, 2r, 2r)` を呼ぶ(`RoundRect` の最後の2引数は角の楕円の幅・高さのため、半径の2倍を渡す)。回転(`with_rotation`)の扱いは矩形と同じ。

**完了基準**:
- `cargo test`: `cornerRadius > 0` の矩形が角丸付きの描画命令に変換され、`cornerRadius` 未指定・0の矩形は従来どおりの矩形になる(spec §13)。
- `npm run tauri dev` で矩形に角丸を設定し、キャンバス・SVGエクスポート・EMFエクスポート(ファイルをPowerPointに挿入)のいずれでも角が丸く表示されることを確認する。角丸を持つテンプレート(例: ビフォーアフター(縦))をEMFでPowerPointに貼り付けた場合も角丸が保たれることを確認する。

## フェーズ20: 手動動作確認・最終確認(要求仕様レビュー指摘への対応)

フェーズ15〜19の内容を、`doc/requirement.md` §4.1・§4.5・§4.7 の記述と実際に突き合わせる。`npm run tauri dev` で起動し、以下を手順どおりに確認する。

1. **タブをまたぐコピー&ペースト**(要求仕様 4.1・4.7): タブ1にツリー図を生成し、ノード図形2つとその間の接続線、および自由配置の矩形2つとそれらをつなぐコネクタを選択して `Ctrl+C`。「+」でタブ2を追加して `Ctrl+V`。貼り付けた図形が表示され、矩形間のコネクタは貼り付けた矩形同士につながっていること(貼り付けた矩形を動かすとコネクタが追従する)。貼り付けたツリーのノード図形のラベルを編集しても、タブ1の階層テキストが変わらないこと。タブ1に戻り、元のツリー図と階層テキストが変化していないこと。
2. **タブを閉じる際の確認**(要求仕様 4.7): 図形を含むタブで×ボタンを押すと「閉じる」「キャンセル」の確認が出ること。「キャンセル」でタブが残り、「閉じる」でタブが閉じること。同じ確認が `Ctrl+W` でも出ること。空のタブは×ボタン・`Ctrl+W` のどちらでも確認なしに閉じること。タブが1枚のときは従来どおり閉じられないこと。
3. **エクスポート対象**(要求仕様 4.5): 2つのタブに異なる図を置き、タブ2をアクティブにしてSVG・PNG・EMFファイルをエクスポートし、いずれもタブ2の図のみが書き出されていること。EMFクリップボードからPowerPointへの貼り付けも同様に確認する。
4. **アプリ終了時の未保存確認**(要求仕様 4.7):
   - 未保存の変更がない状態でウィンドウの閉じるボタンを押すと、確認なしに終了すること。
   - 図形を追加した(未保存の)状態で閉じるボタンを押すと3択の確認が出ること。「キャンセル」で編集を続けられること。「保存しない」で終了すること。
   - もう一度起動し、未保存の状態で閉じる→「保存する」を選ぶ。未保存の新規ファイルの場合は保存ダイアログが出て、保存すると終了すること。保存ダイアログでキャンセルすると終了せず編集を続けられること。
   - `Alt+F4` でも同じ確認が出ること。
5. **整列ガイド線・角丸矩形**(要求仕様 4.1): フェーズ18・19の完了基準の手動確認を実施する。
6. **4.1 受け入れ条件の一巡**: `doc/requirement.md` §4.1 の表の各行(図形の作成・変形、ツール切り替えUI、接続、整列・分布・スナップ・ガイド線、グルーピング、レイヤー順序、複製・コピー&ペースト、Undo/Redo、ズーム・パン)を1行ずつ操作して、受け入れ条件を満たすことを確認する。

- **最終確認**: `npm run test`(Vitest)・`npx tsc --noEmit`・`cargo test`(`src-tauri` で実行)がすべて成功すること。`doc/requirement.md` §4.1・§4.5・§4.7 の各箇条を上記手順ですべて突き合わせたことを確認する。

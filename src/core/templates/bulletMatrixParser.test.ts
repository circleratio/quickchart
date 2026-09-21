import { describe, expect, it } from "vitest";
import { parseBulletMatrixMarkdown } from "./bulletMatrixParser";

const SAMPLE = `
| 施策領域 | 企業にとって | 産業社会にとって |
|---|---|---|
| ① キャリア開発支援 | A1 | B1 |
| ② パフォーマンスの最大化 | A2 | B2 |

## ① キャリア開発支援

### A1

- **エンゲージメント・生産性の向上**
  - キャリア開発施策が成長意欲や会社へのコミットメント向上に寄与するという統計結果がある
  - 大手機械メーカーの声

- **事業環境変化に強い人材の育成**
  - M&Aの増加やAIの普及などにより事業環境と事業ポートフォリオが変化している
  - 各個人には「対応力」の強化が求められる
  - 大手機械メーカーの声

### B1

- **個企業の状況に依存せず働ける人材の創出**
  - 事業環境の悪化を含む急激な変化に耐えられるよう、各分野でキャリアを構築できる人材育成が重要
  - 大手インフラ企業の声

---

## ② パフォーマンスの最大化

### A2

- **労働力不足のフォロー**
  - 高齢者の最適活用が重要になる

### B2

- **労働力不足のフォロー**
  - 高齢人材が活用されることが期待される
`;

describe("parseBulletMatrixMarkdown", () => {
  it("returns empty results for text with no table", () => {
    expect(parseBulletMatrixMarkdown("no table here")).toEqual({ columnHeaders: [], outline: [] });
  });

  it("extracts column headers from the table's header row (excluding the row-header column)", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    expect(result.columnHeaders).toEqual(["企業にとって", "産業社会にとって"]);
  });

  it("extracts one row per table data row, in table order, using the row-header cell as text", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    expect(result.outline.map((r) => r.text)).toEqual(["① キャリア開発支援", "② パフォーマンスの最大化"]);
  });

  it("gives each row exactly one cell per column header", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    for (const row of result.outline) expect(row.children).toHaveLength(2);
  });

  it("fills a cell with title groups from its '### <placeholder>' section, titles stripped of ** markers", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    const row1CellA = result.outline[0].children[0]; // A1
    expect(row1CellA.children.map((t) => t.text)).toEqual([
      "エンゲージメント・生産性の向上",
      "事業環境変化に強い人材の育成",
    ]);
  });

  it("attaches indented bullet lines under a title as its detail children, in document order", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    const firstTitle = result.outline[0].children[0].children[0];
    expect(firstTitle.text).toBe("エンゲージメント・生産性の向上");
    expect(firstTitle.children.map((d) => d.text)).toEqual([
      "キャリア開発施策が成長意欲や会社へのコミットメント向上に寄与するという統計結果がある",
      "大手機械メーカーの声",
    ]);
  });

  it("places a cell's content in the column matching its placeholder's position, not parse order", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    const row1CellB = result.outline[0].children[1]; // B1, parsed after A1 in the source
    expect(row1CellB.children.map((t) => t.text)).toEqual(["個企業の状況に依存せず働ける人材の創出"]);
  });

  it("every generated node id is unique", () => {
    const result = parseBulletMatrixMarkdown(SAMPLE);
    const ids: string[] = [];
    const collect = (nodes: typeof result.outline) => {
      for (const n of nodes) {
        ids.push(n.id);
        collect(n.children);
      }
    };
    collect(result.outline);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ignores a '##' section whose heading text doesn't match any table row", () => {
    const withTypo = SAMPLE.replace("## ① キャリア開発支援", "## ① キャリア開発支援(typo)");
    const result = parseBulletMatrixMarkdown(withTypo);
    // Row still exists (from the table), just with empty cells since its
    // section was never matched.
    expect(result.outline[0].text).toBe("① キャリア開発支援");
    expect(result.outline[0].children.every((c) => c.children.length === 0)).toBe(true);
  });

  it("returns empty results when the table has no separator row", () => {
    const broken = "| a | b |\n| 1 | 2 |\n";
    expect(parseBulletMatrixMarkdown(broken)).toEqual({ columnHeaders: [], outline: [] });
  });
});

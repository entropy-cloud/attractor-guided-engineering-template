# nop-report 模块 Bug 深度分析报告

- 日期：2026-09-05
- 分析对象：`/Users/abc/app/nop-entropy/nop-report`（main 分支，commit `369ae1f62d`）
- 模块规模：13 个子模块、约 177 个 Java 文件、约 2.4 万行（不含 `_gen` 生成代码约 5.5k 行）
- 分析方式：核心引擎（core）逐文件人工精读 + 外围子模块（pdf/docx/web/service/ext/dao/api/dataset）全量扫描 + 所有列入报告的发现逐一回到源码核实；关键语义（坐标闭区间、深拷贝、基类解析器契约、`MathHelper.divide` 等）追溯到了 nop-excel / nop-xlang / nop-commons 的实现
- 结论口径：【高】= 代码逻辑确定、无需运行即可断定；【中】= 逻辑确定但触发依赖特定模板/配置；【低】= 事实确定但影响轻微或属设计确认项

---

## 一、总体结论

模块存在真实 bug，共确认 **28 项**：高置信度 13 项、中置信度 9 项、低置信度/轻微 6 项。其中 4 项属于"静默产出错误数据"级别（比崩溃更危险）：

1. **Excel 公式关键字 `AND`/`OR` 解析对调**（core/expr）——条件公式结果静默取反；
2. **列层次坐标解析三连缺陷**（core/coordinate）——列坐标公式崩溃或取错值；
3. **PDF 页眉/页脚垂直位置镜像颠倒**（pdf）——所有带页眉页脚的 PDF 输出位置错误；
4. **`SUMIF`/`COUNTIF` 条件比较语义错误**（core/functions）——`>=`/`<=` 条件被降级为 `>`/`<`。

崩溃类缺陷（NPE/数组越界/死循环）共 8 项。资源类缺陷 2 项（PDDocument 泄漏、临时目录句柄）。其余为功能性偏差与错误上报缺陷。

---

## 二、高置信度缺陷（13 项）

### B1.【高|数据错误】Excel 公式 `AND`/`OR` 关键字解析对调

- 位置：`nop-report-core/src/main/java/io/nop/report/core/expr/ExcelFormulaParser.java:195-208`
- 代码：
```java
@Override
protected boolean consumeOrOp(TextScanner sc) {
    if (sc.tryMatchToken("AND")) {   // 应匹配 "OR"
        return true;
    }
    return false;
}

@Override
protected boolean consumeAndOp(TextScanner sc) {
    if (sc.tryMatchToken("OR")) {    // 应匹配 "AND"
        return true;
    }
    return false;
}
```
- 机理：基类 `AbstractExprParser`（nop-xlang）中 `orExpr()` 循环调用 `consumeOrOp` 命中后以 `XLangOperator.OR` 构建逻辑表达式，`andExpr()` 循环调用 `consumeAndOp` 以 `AND` 构建。本覆盖方法把两个关键字写反：`a > 1 AND a < 5` 被解析为 `OR(a>1, a<5)`（恒真），`a OR b` 被解析为 `AND(a, b)`。同时覆盖后丢弃了基类的 `||`/`&&` 符号支持。
- 触发：模板 Excel 单元格公式（`XptModelInitializer.normalizeValueExpr` 对带公式的单元格走 `ExcelFormulaParser.parseFormula`）、`IF("条件", 区域)` 过滤语法的条件串、`xptRt.evalExcelFormula(...)` 调用。
- 影响：报表条件计算结果静默错误，无任何报错。
- 附证：`nop-report-core/src/test/.../TestExcelFormulaParser.java` 无任何 AND/OR 关键字用例，与该缺陷长期未被发现一致。
- 修复：两个方法内的关键字对调回来；如需保留 `||`/`&&`，回落到 `super` 实现。

### B2.【高|崩溃/数据错误】列父格解析使用 `getRowDescendants`（复制粘贴错误）

- 位置：`nop-report-core/src/main/java/io/nop/report/core/coordinate/CellCoordinateHelper.java:287`
- 代码（`resolveAllCellsInColParent`）：
```java
if (cellName.equals(cell.getName())) {
    if (cell.getExpandType() == XptExpandType.c) {
        return parent.getRowDescendants().get(cellName);   // 应为 getColDescendants()
    } else {
        return Collections.singletonList(cell);
    }
}
```
- 机理：行版本 `resolveAllCellsInRowParent`（第 270 行）正确使用 `getRowDescendants()`；列版本是同构代码，却沿用了行方法。列展开格通常只有 `colDescendants`，`rowDescendants` 为 `null`。
- 触发：列层次坐标表达式（形如 `X[...;...]`）在 `resolveColCoordinates` 首坐标解析时进入该分支。
- 影响：NPE 崩溃；即使 `rowDescendants` 恰好非空，返回的也是错误的行后代集合，坐标解析静默取错值。

### B3.【高|崩溃/数据错误】列坐标绝对位置分支缺少 `pos > 0` 校验且边界差一

- 位置：`CellCoordinateHelper.java:197-201`（`resolveColCoordinates`）
- 代码：
```java
} else {
    if (pos < cells.size()) {          // 行版本(第89行)是: pos > 0 && pos <= cells.size()
        resolvedCell = cells.get(pos - 1);
    }
}
```
- 机理：与行版本逐行对照，列版本丢了两个条件：
  - `pos == 0` 时进入 `cells.get(-1)` → `IndexOutOfBoundsException`；
  - `pos == cells.size()`（1-based 语义下的最后一个，合法值）时条件为假 → `resolvedCell` 保持 null → 整个坐标解析返回 null，取值失败。
- 影响：坐标越界崩溃或最后一个展开列的公式取值静默丢失。

### B4.【高|崩溃】层次坐标解析终点无空保护

- 位置：`CellCoordinateHelper.java:99`（行版本）与 `:208`（列版本）
- 代码：
```java
return resolvedCell.getRowDescendants().get(cellName);   // 列版本为 getColDescendants()
```
- 机理：`resolvedCell` 在循环中可能来自 `resolveAllCellsInRowParent` 的兜底分支 `cell.getTable().getNamedCells(cellName)`——顶层命名单元格的 `rowDescendants`/`colDescendants` 均可能为 `null`，直接解引用 NPE；`.get(cellName)` 结果为 null 虽被调用方容忍，但 map 本身为 null 必崩。
- 触发：坐标命中的是一个没有子格的展开格/命名格。

### B5.【高|数据错误】`ExpandedCell.childCell` 列分支返回 null

- 位置：`nop-report-core/src/main/java/io/nop/report/core/model/ExpandedCell.java:735-753`
- 代码：
```java
public ExpandedCell childCell(String cellName, IXptRuntime xptRt) {
    if (rowDescendants != null) {
        List<ExpandedCell> cells = rowDescendants.get(cellName);
        if (cells != null && !cells.isEmpty()) {
            ExpandedCell cell = cells.get(0);
            xptRt.evaluateCell(cell);
            return cell;
        }
    }
    if (colDescendants != null) {
        List<ExpandedCell> cells = colDescendants.get(cellName);
        if (cells != null && !cells.isEmpty()) {
            ExpandedCell cell = cells.get(0);
            xptRt.evaluateCell(cell);
            return null;                    // 复制粘贴遗漏：应为 return cell;
        }
    }
    return null;
}
```
- 影响：`childValue()`/模板表达式 `cell.cv('子格名')` 对**列子格**永远返回 null（求值副作用已发生，值被丢弃）。行子格正常，因此只在列向布局（横向分组报表）中暴露。

### B6.【高|数据错误】`getExpandableRowParent` 递归调用错对象

- 位置：`ExpandedCell.java:622-630`
- 代码：
```java
public ExpandedCell getExpandableRowParent() {
    if (rowParent == null)
        return null;
    if (rowParent.getModel() == null)
        return null;
    if (rowParent.getModel().getExpandType() == null)
        return rowParent.getExpandableColParent();   // 应为 getExpandableRowParent()
    return rowParent;
}
```
- 机理：沿行父链向上查找可展开行父格时，一旦中间父格不可展开，就跳到该父格的**列父链**上继续找，真正的行祖先被跳过。
- 影响：`CellRowExpander.isAllowReuse`（第 167 行）用两侧的 `getExpandableRowParent()` 判定"是否同一父格的兄弟"来决定行复用；该判定失真会导致 `expandInplaceCount`（就地展开）场景下复用/插入行判断错误，表现为模板预留空间被错误共享、明细行互相覆盖。

### B7.【高|功能失效】图片/图表扩展配置解析被 `break` 中断

- 位置：`nop-report-core/src/main/java/io/nop/report/core/build/ExcelToXptModelTransformer.java:189-190`（图片）、`:230-231`（图表）
- 代码：
```java
for (ExcelImage image : sheet.getImages()) {
    String desc = image.getDescription();
    if (desc == null)
        continue;
    int pos = desc.indexOf("----");
    if (pos < 0)
        break;          // 一张图片没有 "----" 配置，后续所有图片全部跳过
    ...
}
```
- 机理：循环体内意图是"本项无扩展配置则跳过本项"，应为 `continue`；`break` 导致从第一张缺少 `----` 分隔符的图片/图表起，同表后续所有图片/图表的 `testExpr`/`dataExpr`/动态绑定配置全部静默丢失（图表版本还会把 `description` 已截断的副作用留在前几项上）。

### B8.【高|崩溃】`ExcelRecordOutput` 配置页眉/页脚 sheet 必然 NPE

- 位置：`nop-report-core/src/main/java/io/nop/report/core/record/ExcelRecordOutput.java:244-251`，配合 `engine/ExpandedSheetGenerator.java:284-294`
- 代码：
```java
// ExcelRecordOutput.genSheet
IExcelSheet expandedSheet = new ExpandedSheetGenerator(xptModel)
        .generateSheet(sheet, xptRt, null);      // sheetNames 传 null
...
// ExpandedSheetGenerator.uniqueName
Integer index = sheetNames.putIfAbsent(sheetName, nextIndex);   // null.map → NPE
```
- 机理：`generateSheet` 对 `sheetNames` 参数无判空；流式导出工具 `ExcelRecordOutput` 固定传 `null`。
- 触发：`ExcelIOConfig.headerSheetName` 或 `trailerSheetName` 配置了非空值时，`beginWrite()`/`endWrite()` 直接 NPE。
- 附带问题（同文件）：`close()` 仅当 `genTrailer == true` 才落盘，若调用方未走 `endWrite`（异常中断、提前关闭），已写入的数据被静默丢弃且不报错；此时 `out` 也未 close，异常路径存在句柄泄漏。

### B9.【高|资源泄漏】PDDocument 从不关闭

- 位置：`nop-report-pdf/src/main/java/io/nop/report/pdf/renderer/PdfReportRenderer.java:32-55`
- 机理：构造函数 `new PdfRenderer(new PDDocument())`，`generateToStream` 中 `renderer.saveToStream(os)` 后直接返回，全模块 grep 无任何 `PDDocument.close()` 调用（仅 contentStream 关闭）。每次渲染 PDF 泄漏一个 PDDocument（PDFBox 保存后仍持有缓冲与跨流资源）；`renderSheet` 抛异常时同样泄漏。工厂每次 `buildRenderer` 新建实例，无复用。
- 修复：`generateToStream` 用 try-with-resources 管理 `PDDocument`（或在 `PdfRenderer` 上实现 `Closeable` 并在 finally 关闭）。

### B10.【高|功能失效】标准 14 字体注册与字体别名机制整体失效

- 位置：`nop-report-pdf/src/main/java/io/nop/report/pdf/font/FontManager.java:42-52、76-83`
- 机理：`registerSystemFonts()` 为 `private` 且全仓库无调用点（`init()` 中也没有）；`systemFonts` 永远为空 → `getSystemFont()` 永远返回 null → 所有字体（含 `Times New Roman`、`Courier` 等本可用 PDFBox 标准 14 字体直接命中的）都落到 `loadFont` 去 VirtualFileSystem 找 `/fonts/<名字>.ttf`，找不到即回退 default.ttf/Helvetica 并仅打 warn。模板指定的字体被**静默替换**，字形与排版度量随之改变。`addFontAlias`/`fontNameAliases` 写入后无任何读取点，别名机制为死代码。
- 修复：在 `init()` 中调用 `registerSystemFonts()`；`getFont` 命中失败时查别名表。

### B11.【高|渲染错误】PDF 页眉/页脚垂直位置镜像颠倒

- 位置：`nop-report-pdf/src/main/java/io/nop/report/pdf/renderer/PdfSheetRenderer.java:182-205`
- 机理：`renderHeaderFooter` 在 `applyPageSetup` **之前**调用，contentStream 无任何坐标变换，使用 PDF 原生坐标系（原点左下、y 向上）。而传入的 y 值按"距页顶距离"（top-origin）计算——`ExcelPrintHelper.calculatePrintArea`（nop-excel 第 45-69 行，已核实）返回 `y = top + header`：
  - 页眉 `headerY = (top + header) - header = top`（约 36~75pt）被解释为"距页底 top pt"→ **页眉画到页底**；
  - 页脚 `footerY = top + header + height + footer ≈ pageHeight - bottom` 被解释为"距页底近 800pt"→ **页脚画到页顶**。
- 影响：所有配置了页眉/页脚的 PDF 输出位置颠倒；文本若超出上下边距区还会与表格内容重叠。
- 修复：换算为 PDF 坐标，如 `headerY = pageHeight - printArea.getY()` 方向，或统一先建立 top-origin 变换再渲染。

### B12.【高|渲染错误】DOUBLE 边框继承前一条边框的虚线状态

- 位置：`nop-report-pdf/src/main/java/io/nop/report/pdf/utils/PdfStyleHelper.java:228-251`（`drawBorderLine`）
- 机理：`drawBorder` 按上→右→下→左→对角线顺序复用同一个 contentStream 连续画线。`DASHED`/`DOTTED`/`DASH_DOT*` 分支设置 dash pattern；`default` 分支用空 pattern 复位；唯独 `case DOUBLE` 直接 `return`，从不复位。上边框虚线 + 下边框双线 → 双线以虚线绘制，且 dash 状态继续泄漏到后续单元格的第一条 DOUBLE 边框。
- 修复：`case DOUBLE` 画线前 `setLineDashPattern(new float[]{}, 0)`。

### B13.【高|数据错误】`compareWithOperator` 双字符操作符被截断

- 位置：`nop-report-core/src/main/java/io/nop/report/core/functions/ReportFunctions.java:481-517`（`COUNTIF`/`SUMIF` 的条件比较）
- 代码：
```java
String op = condition.substring(0,
        condition.indexOf(condition.replaceAll("[^<>=]", "").charAt(0)) + 1);
...
switch (op) {
    case ">": return numValue > condValue;
    case ">=": return numValue >= condValue;   // 永远走不到：op 已被截成 ">"
    ...
}
```
- 机理：op 提取逻辑只取到第一个操作符字符，`">=5"` 被截成 `">"`、`"<=x"` 被截成 `"<"`、`"<>x"` 被截成 `"<"`——数值比较全部降级。而同方法后段的字符串比较分支用 `condition.replaceAll("[^<>=]", "")` 取到了完整操作符，两分支语义不一致。
- 触发：`COUNTIF(range, ">=100")`、`SUMIF(range, "<>x")` 等常见用法。
- 影响：条件统计/求和静默出错。
- 备注：该段位于源码注释标明的"以下函数为AI生成"区域，无测试覆盖。

---

## 三、中置信度缺陷（9 项）

### M1.【中|数据错误】`SUMIF` 未传 `sumRange` 时迭代器复用错位

- 位置：`ReportFunctions.java:398-424`
- 代码：`Iterator<Object> sumIt = sumRange != null ? CollectionHelper.toIterator(sumRange, true) : rangeIt;` 循环内 `rangeIt.next()` 与 `sumIt.next()` 各前进一步。
- 机理：`sumIt` 与 `rangeIt` 是同一实例，每轮消费两个元素——一半单元格被跳过，且条件判断的是第 2k 个元素、求和的却是第 2k+1 个。Excel 语义应为"对满足条件的 range 单元格自身求和"。

### M2.【中|数据错误】`ReportDataSet.avg/avgBy` 分母含空值行、空集返回 NaN

- 位置：`nop-report-core/.../dataset/ReportDataSet.java:240-262`
- 机理：分子跳过空值（`isEmptyObject` 判断），分母却是 `items.size()`（含空值行）——部分空值时均值系统性偏低；数据集为空时 `MathHelper.divide(0, 0)` 返回 NaN（已核实 nop-commons 实现不抛异常）并静默传播进单元格与后续公式。`avgBy` 同构同病。

### M3.【中|渲染错误】`applyPageSetup` 平移量在非对称页边距下错位

- 位置：`PdfSheetRenderer.java:125-133`
- 机理：`translate(x, printArea.getEndY())`，其中 `getEndY() = top + header + height`。PDF 坐标系下正确值是 `pageHeight - (top + header)`。二者相等当且仅当上下边距对称（默认边距恰好对称，故默认看不出问题）；模板设置非对称上下边距时，整表内容垂直偏移 `|(top+header)-(bottom+footer)|` pt。与 B11 同源：top-origin 与 PDF bottom-origin 混用。

### M4.【中|崩溃】PDF 页眉/页脚 style 为 null 时 NPE

- 位置：`PdfSheetRenderer.java:227-232`（`renderText`）
- 机理：`ExcelHeaderFooter.getStyle()` 是可空属性；模板只配 header/footer 文本未配 style 时 `style.getFont()` NPE，整份 PDF 渲染失败。同文件 `PdfTableRenderer.getStyle()`（154-162 行）有 null 兜底，此处遗漏。

### M5.【中|崩溃】`PdfTableRenderer.getFontSize` 对可空 Float 自动拆箱

- 位置：`nop-report-pdf/.../renderer/PdfTableRenderer.java:194-196`
- 机理：`getStyleFont(style).getFontSize()` 返回可空 `Float` 直接拆箱为 float；同类 `getFontSizeString()`/`toCssStyle()` 均显式判 null，说明模型层允许缺省。字号缺省的样式渲染即 NPE。`PdfStyleHelper.getFontSize` 已有判空版本但未复用。

### M6.【中|崩溃】`FontManager.getDefaultFont` 可能返回 null/未初始化

- 位置：`FontManager.java:76-79`，配合 `PdfRenderer.java:31-38`
- 机理：`defaultFont` 只在 `init()` 中赋值，而 `init()` 只被 `getFont(String,...)` 触发；`PdfRenderer.getFont(ExcelFont)` 在 fontName 为 null 时直接 `getDefaultFont()` 不触发 init——首次渲染若全部单元格未指定字体，`contentStream.setFont(null, size)` 抛异常。另外 `init()` 内 `new PDType1Font(HELVETICA)` 异常时只记日志并置 `inited=true`，此后永远返回 null。

### M7.【中|崩溃】`TextWrapHelper.wrapByWord` 极窄容器死循环

- 位置：`nop-report-pdf/src/main/java/io/nop/report/pdf/utils/TextWrapHelper.java:70-98`
- 机理：`maxWidth` 小于单字符宽度且行内无空格时：`i--` 回退后 `for` 的 `i++` 抵消，`lineStart` 不变，每轮向 `lines` 追加一个空串——无限循环直至 OOM。当前唯一调用方 `PdfStyleHelper.drawWrappedText` 走 mode 2（强制折行）避开了该分支，属**潜伏缺陷**，任何人以默认模式调用即触发。

### M8.【中|崩溃】`ExcelTemplateToXptModelTransformer` 两处缺判空

- 位置：`nop-report-core/.../imp/ExcelTemplateToXptModelTransformer.java:375-376`（`endList`）、`:247-251`（`beginList`）
- 机理：`endList` 中 `getCell(rowIndex, range.colIndex)` 返回 null 时直接 `cell.getText()` NPE——同文件 `beginList`（255 行）对同样的取值有 `cell != null` 判断，`endList` 遗漏；`beginList` 的 `headerCell`（247 行）取回后也未判 null 就 `getMergeDown()`。模板索引列/表头位置形态稍有变化即崩。

### M9.【中|错误上报】列循环校验报错参数张冠李戴

- 位置：`nop-report-core/.../build/XptModelInitializer.java:427-435`（`checkLoop`）
- 机理：列父格循环检测抛 `ERR_XPT_COL_PARENT_CONTAINS_LOOP` 时 `.param(ARG_ROW_PARENT, cell.getModel().getRowParent())`——错误码、参数名、取值都是行版本的，列父格信息丢失，排障误导。

---

## 四、低置信度 / 轻微问题（6 项）

| # | 位置 | 问题 | 说明 |
|---|------|------|------|
| L1 | `nop-report-ext/.../ReportExtFunctions.java:56` | `image.setImgType(image.getImgType())` 自赋值 no-op | 紧邻 `createQrcodeBytes` 调用，疑似笔误残留；功能无害但意图不明 |
| L2 | `ExpandedCellSet.java:201、211` | `rowChildSet`/`colChildSet` 对 `getRowDescendants()` 无判空 | 单格版本 `ExpandedCell.rowChildSet`（890 行）有判空，集合版本没有；集合中任一格无后代即 NPE。当前仓内无 Java 调用方，暴露面为模板表达式 |
| L3 | `ExpandedSheetGenerator.java:103、142` | sheet 名去重 map 按模板创建 | 两个 sheet 模板经 `sheetNameExpr` 生成同名 sheet 时去重失效，产出的 xlsx 含重名 sheet（非法文件）。触发概率低 |
| L4 | `PdfImageHelper.java:36-40` | 图片加载失败占位矩形高度写死 `width * 0.75f` | 方法有 `height` 参数未用；竖长图（条码）失败时占位块与原区域严重不符 |
| L5 | `ReportDataSet.java:46-60` + `CollectionHelper.toList` | `makeDs(dsName, 单个Bean/Map)` 抛集合层内部异常 | `toList` 对非集合入参抛 `ERR_COLLECTIONS_NOT_LIST`，"单行数据集"这一常见诉求得到的是晦涩错误 |
| L6 | `PdfSheetRenderer.renderImages`、`ExpandedSheetEvaluator.evaluateImages:81` | `image.getAnchor()` 无判空 | 模板图片缺 anchor 时 NPE；正常导出的模板都有 anchor，属防御性缺失 |

另有两项**设计确认项**（不算确定性 bug，建议向作者确认意图）：

- `DynamicReportDataSet.makeDataSetFromValue` 对 `List` 入参原样共享引用，且 `setLocalValue(dsName, ds)` 会用包装对象覆盖 scope 中同名原始变量；外部在渲染中途修改列表会穿透到数据集视图。
- `CellRowExpander` 与 `CellColExpander` 的 `minReuse/maxReuse` 记账条件写法不一致（行版本无条件记录、列版本仅复用时记录）——经推演两者 `skipExtendSpan` 结果等价，非 bug，但极易在后续维护中被"改一致"时改错，建议加注释说明。

---

## 五、已排查且未发现问题的方面

以下方面经定向核查后确认无问题，列出以免重复排查：

1. **SQL 注入/JDBC**：dao/api/dataset 目录无任何 SQL 拼接、表名拼接与 JDBC 代码；dao 手写部分是生成器空壳。数据集 `where/filter` 是内存谓词过滤。
2. **跨请求模板污染**：`ExcelChartModel.cloneInstance` 为深拷贝（title/plotArea/series/axes 逐层 clone，已核实 `ChartPlotAreaModel.cloneInstance`）；渲染期单元格变更发生在 `ExpandedTable` 副本上，模板对象（`ResourceComponentManager` 缓存）不被改写。
3. **宽度/高度语义**：`IExcelSheet.getWidth(from,to)` 为闭区间（`getTotalWidth = getWidth(0, colCount-1)` 已核实），`ExpandedCell.getWidth/getHeight` 的 `+mergeAcross/+mergeDown` 用法正确，无差一错误。
4. **删行/删列的合并格自愈**：`ExpandedTable.removeRow/removeCol` 的 `changeRowSpan(-1)` 与重锚定（downCell 继承 + `markProxy()` 重刷覆盖区）推演自洽。
5. **展开算法主流程**：`TableExpander` 的父格就绪检查（`isExpanded` 以 `expandIndex>=0` 判定，展开前置 0）无死循环；`AbstractCellExpander.duplicate` 首元素在循环外消费的计数正确；`expandMaxCount/expandMinCount` 的 Limit/Fill 迭代器包装顺序正确。
6. **并发**：`XptRuntime` 每次渲染新建、`cellExprCache/formulaCompileCache` 为实例级；`FontManager.init()` synchronized；pdf 渲染器的 fontCache/imageCache 为渲染实例成员；无 `SimpleDateFormat` 共享、无运行期可写静态集合。
7. **作用域隔离**：每次渲染 `scope.newChildScope()`，数据集不会跨报表串数据；`sort/sortBy/sort(List)` 均先拷贝再排序，不污染原始列表。
8. **XML/路径安全**：docx 输出走框架转义（`CollectXmlHandler`），无手工拼 XML；无 SSRF 面；字体路径拼接输入源为受信模板，风险低。
9. **图片锚点 delta**：`QRCODE` 的 `setRowDelta(getRowSpan())` 经 `CellAnchor` 排他边界与 `ExcelImage.calcSize` 语义核实**不是** off-by-one。
10. **docx 边遍历边改树**（`XptWordTemplateParser.postProcessDocNode`）：依赖 `ArrayList.set` 不增 modCount 的实现细节，当前正确但脆弱，建议重写（非 bug）。
11. **`MathHelper` 系列**：`SUM/PRODUCT/AVERAGE/MIN/MAX/SUMPRODUCT` 迭代步进与锁步配对正确（`SUMPRODUCT` 两迭代器每轮各进一步，非数值跳过不错位）。

---

## 六、修复优先级建议

**P0（静默数据错误，建议立即修）**

| 项 | 修复成本 |
|----|----------|
| B1 AND/OR 对调（ExcelFormulaParser:195-208，两行对调） | 极低 |
| B13 COUNTIF/SUMIF 操作符截断（ReportFunctions:483） | 低 |
| B2/B3/B4 列坐标解析三连（CellCoordinateHelper:287、198、99/208） | 低 |
| M1 SUMIF 迭代器错位（ReportFunctions:405-406） | 低 |
| M2 avg 分母/NaN（ReportDataSet:240-262） | 低 |

**P1（崩溃/功能失效）**

- B7 break→continue（ExcelToXptModelTransformer:190、231）
- B8 ExcelRecordOutput null map NPE + genTrailer 静默丢弃
- B5 childCell 返回 null（ExpandedCell:751）
- B6 getExpandableRowParent 递归错对象（ExpandedCell:628）
- B10 registerSystemFonts 未调用（FontManager）
- B11 页眉页脚坐标颠倒 + M3 非对称边距（PdfSheetRenderer，建议一并统一坐标系）
- B12 DOUBLE 边框 dash 泄漏（PdfStyleHelper:247）
- B9 PDDocument 泄漏

**P2（防御性/低危害）**

- M4-M9 各 NPE 防护与错误参数；L1-L6；B10 附带的死代码清理（fontNameAliases）

**流程建议**

- B1、B13 均位于无测试覆盖区域，修复时应补最小回归用例（`AND`/`OR` 关键字公式各 1 例；`COUNTIF(range, ">=100")` 1 例；列层次坐标 `X[...;...]` 解析 3 例：pos=0、pos=末位、pos=中间）。
- 行/列两个 Expander 与 `CellCoordinateHelper` 的行列同构代码已出现 3 处"行对列错"的复制粘贴缺陷（B2、B3、B6 同模式），建议为同构方法增加行/列对照评审清单，或抽公共参数化实现。

---

## 附：核实方法说明

- 所有高置信度项均由分析者亲自回到源码逐行核对（非仅采信扫描结论）；跨模块语义（`AbstractExprParser` 的 OR/AND 契约、`ExcelPrintHelper.calculatePrintArea` 的 top-origin 语义、`ChartPlotAreaModel.cloneInstance` 深拷贝、`IExcelSheet.getWidth` 闭区间、`MathHelper.divide` 的 NaN 行为、`CollectionHelper.toList` 对非集合抛错）均追溯到依赖模块实现确认。
- 缺陷编号在本报告内部自洽（B=bug/高、M=medium、L=low），供后续修复计划引用。

---

## 修复记录（2026-09-05 同日完成，TDD 流程）

按"测试先失败、修复后转绿"流程完成修复。新增 8 个测试类、26 个测试方法；修复前 26/26 按预期失败（失败签名与缺陷机理一一对应），修复后全部转绿；回归范围：nop-report-core 55/55、nop-report-pdf 8/8、demo/docx/service/web/ext 共 24 项全部通过，零回归。

**生产代码变更**：18 个文件、+123/-71 行（nop-entropy 仓库，未提交）。

### 带失败测试的修复（16 项）

| 编号 | 测试类 |
|------|--------|
| B1 AND/OR 对调 | `TestExcelFormulaLogicKeyword`（3 例） |
| B2/B3/B4 列坐标解析 | `TestColLayerCoordinateResolve`（4 例） |
| B5 childCell / B6 getExpandableRowParent / L2 rowChildSet NPE | `TestExpandedCellLinks`（3 例） |
| B8 generateSheet null map | `TestGenerateSheetUniqueName` |
| B7 图片/图表配置 break | `TestImageConfigParseLoop`（反射测私有方法） |
| B13 COUNTIF 操作符 / M1 SUMIF | `TestReportFunctionsCondition`（5 例） |
| M2 avg 分母/NaN | `TestReportDataSetAvg`（3 例） |
| B9 PDDocument 关闭 / B10 标准字体 / B11 页眉页脚坐标 / B12 dash 复位 / M3 平移量 / M6 getDefaultFont | `TestPdfSheetRenderFixes`（6 例，经 PDFStreamParser 解析内容流断言坐标与虚线状态） |

### 无独立测试的修复（7 项，均已通过既有套件回归验证）

- M4：`PdfSheetRenderer.renderText` 对 null style 判空（B11 测试间接覆盖了渲染路径）
- M5：`PdfStyleHelper.getFontSize`/`PdfTableRenderer.getFontSize` 拆箱 NPE（B11 测试修复前正是因该 NPE 而失败，间接覆盖）
- M7：`TextWrapHelper.wrapByWord` 单字符超宽时强制前进，消除死循环
- M8：`ExcelTemplateToXptModelTransformer` endList/beginList 判空
- M9：`XptModelInitializer.checkLoop` 列循环错误改用 `ARG_COL_PARENT`/`getColParent`
- L1：`ReportExtFunctions.QRCODE` 删除自赋值死代码
- L4：`PdfImageHelper` 错误占位符改用 height 参数

### 语义决策记录

- `ReportDataSet.avg/avgBy`：改为"分母只计非空值行"；空集返回 `null`（不再返回 NaN）。与 `ReportFunctions.AVERAGE`（保持 Excel #DIV/0!→NaN 行为） intentionally 不同，数据集 API 面向模板作者，null 渲染为空白更安全。
- 列坐标绝对定位与行版本对齐：`pos > 0 && pos <= size`（1-based）；不带位置的坐标返回 null（与行版本一致）。
- `generateSheet` 对 `sheetNames == null` 改为内部创建临时去重表（兼容 `ExcelRecordOutput` 的既有调用方式）。

### 未修复项（维持原报告结论）

- 设计确认项两项（数据集列表别名共享、行/列 Expander 的 minReuse 记账风格差异）与低危的 L3（跨模板 sheet 重名）、L5（单值数据集报错不友好）、L6（图片 anchor 判空）未动，建议由仓库作者决策。

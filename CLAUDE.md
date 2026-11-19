# AGENTS.md · 给 AI Agent 的部署说明

你（AI Agent）读到这份文件，通常是因为用户说了类似这样的话：

- "帮我把 github.com/mix-shijie/yizhangban 部署成我们店的板材展示页"
- "帮我看看这个板材配置器，能不能用在我们门店"
- "帮我用这个仓库做一个配置器，花色换成我发给你的这几张"

这是一个**纯静态网页**（HTML + JavaScript + Three.js），没有后端、没有数据库、没有构建步骤。下面是完整步骤。

## 必须遵守的规则

1. **发布到公网、上传任何文件、创建或推送任何仓库之前，必须先问用户，得到明确同意再做。**本地运行和本地修改不需要问。
2. **不收集用户的任何数据。**不要加统计、埋点、表单、cookie、后端或任何第三方脚本；不要把用户的图片、联系方式发到仓库和用户指定的托管之外的任何地方。
3. **所有价格必须保留"示意"字样。**不要把示意价格改成"报价"或删掉"示意"标注；用户给了真实价格也要保留"示意"提示，除非用户明确要求并自己承担。
4. **不要把用户的密码、令牌写进任何文件。**登录 GitHub 等账号的操作让用户自己在浏览器里完成。
5. 保留 `LICENSE`、`CONTENT_LICENSE.md` 和 `vendor/` 里的第三方许可证文件。

## 1. 本地运行（一条命令）

需要 Python 3，只用标准库：

```bash
python tools/serve.py
```

会打开 <http://localhost:8765/>（端口被占用会自动往后找）。不想自动开浏览器加 `--no-browser`；竖屏加 `--vertical`。

没有 Python：`npx serve .` 或任何静态文件服务都可以。**不要直接用 file:// 打开**，那样读不到 `config.json`，会退回默认设置。

确认能用：页面左上角出现标题，底部有一排花色色块，右上角有"材料单与报价 · 示意"。浏览器控制台里以 `[config]` 开头的警告说明 `config.json` 有字段不合格、已退回默认值。

## 2. 改 config.json

用户的定制需求几乎都只需要改根目录的 `config.json`。改完让用户按 Ctrl+F5 刷新。

```jsonc
{
  "brand": {
    "title": "一张板的真相",          // 大标题 → 换成门店/品牌想用的标题
    "subtitle": "MIX饰界智变",        // 副标题 → 例如门店名
    "productBrand": "示例品牌 A",      // "讲给 AI 听"里的品牌名
    "productName": "地下室整墙储物柜 · 定制方案（示例）",
    "contact": ""                      // 左上角一行联系方式，例如 "电话 400-000-0000"；留空不显示
  },
  "defaultFinish": "oak",              // 默认花色 id，必须在 finishes 里
  "finishes": [ ... ],                 // 花色列表，见下文
  "cabinet": {
    "widthsMm": [600, 700, 1000, 700, 600],  // 5 个柜子的宽度，合计必须等于 3600
    "heightMm": 2400,                         // 默认高度
    "minModuleWidthMm": 300, "maxModuleWidthMm": 1200,
    "minHeightMm": 1900, "maxHeightMm": 2500  // 房间层高 2600，最大不要超过 2550
  },
  "pricing": {
    "currency": "¥",
    "wasteFactor18": 1.18, "wasteFactor9": 1.1, "edgeFactor": 1.1, "shelfPinPrice": 0.5,
    "coreFactor": { "pb": 1, "mdf": 0.96, "ply": 1.25, "eco": 1.2 },  // 刨花板/密度板/多层板/生态板 的价格系数
    "tiers": [ { "name": "经济", "p18": [150, 200], "p9": [45, 60], "edge": [3, 4], "hinge": [8, 12], "slide": [35, 55], "handle": [10, 16], "led": [60, 90] }, ... ]
  },
  "demo": { "finishSequence": ["oakc", "walnut", "cherry", "marble", "sage", "oak"] }
}
```

（上面带注释只是为了说明，真实的 `config.json` 是标准 JSON，不能写注释。）

- `pricing.tiers` 最多 3 档。每项是 `[低, 高]` 区间：`p18` 18 mm 板每平米、`p9` 9 mm 背板每平米、`edge` 封边每米、`hinge` 铰链每只、`slide` 滑轨每对、`handle` 拉手每个、`led` 灯带每条。总价按百位取整。
- 尺寸不合格（不是 5 个、合计不是 3600、超出上下限）会退回默认值，并在控制台警告。后墙柜总宽 3600 mm 是房间布局定死的。
- 改完用 JSON 校验一遍，例如 `python -c "import json;json.load(open('config.json',encoding='utf-8'))"`。

## 3. 换花色

`finishes` 里每一项是一种花色，顺序就是底部色块的顺序。两种写法：

**引用内置花色（程序生成，无需图片）：**

```json
{ "id": "walnut", "builtin": "walnut", "name": "胡桃", "kind": "直纹" }
```

内置 id：`oak` 暖橡、`oakc` 山纹橡、`walnut` 胡桃、`cherry` 樱桃、`ash` 白蜡、`smoke` 烟熏橡、`marble` 雪域白、`slate` 岩灰、`cream` 奶油白、`sage` 鼠尾草、`graphite` 石墨灰。`name` 和 `kind` 可以改成门店自己的叫法。

**用用户自己的图片：**

```json
{ "id": "store-oak-01", "name": "北欧白橡", "kind": "直纹", "image": "finishes/store-oak-01.jpg", "rough": 0.6 }
```

- 把图片复制进 `finishes/`，文件名用英文、数字、短横线。
- 图片要求：竖版 1:2，代表一整张 1220 × 2440 mm 的板，纹理竖向；建议 1024×2048 像素，最大 2048×4096；JPG 或 PNG，单张 1 MB 以内。比例不对会自动居中裁成 1:2。能无缝拼接最好。
- 用户发来的是小样照片（只拍了一小块）：先告诉用户，整板效果会显得纹理偏大；如果用户同意，可以把小样平铺拼成 1:2 再用。
- `kind` 写 `纯色` 时表面凹凸会更弱。`rough` 是粗糙度 0–1，亮光面 0.3 左右，哑光 0.6 左右。
- 图片读取失败的花色会被跳过，并在控制台警告。
- 换了花色后，把 `defaultFinish` 和 `demo.finishSequence` 也改成新的 id。

## 4. 部署到 GitHub Pages（先问用户）

**动手前先跟用户确认：**用哪个 GitHub 账号、仓库公开（GitHub 免费账号的 Pages 需要公开仓库）、网址会是 `https://<账号>.github.io/yizhangban/`、仓库里的内容（含用户的图片和联系方式）会公开。用户同意后：

```bash
# 1) 用户自己登录（在浏览器里完成，不要代填密码或验证码）
gh auth login

# 2) fork 到用户自己的账号并克隆到本地
gh repo fork mix-shijie/yizhangban --clone
cd yizhangban

# 3) 按第 2、3 步改 config.json、放图片，本地跑一遍确认，然后提交
git add -A
git commit -m "定制：门店品牌与花色"
git push

# 4) 开启 Pages（来源为 GitHub Actions）
gh api -X POST repos/<账号>/yizhangban/pages -f build_type=workflow
#    如果提示已存在，改用：gh api -X PUT repos/<账号>/yizhangban/pages -f build_type=workflow

# 5) fork 出来的仓库默认不运行 Actions：让用户在网页上打开仓库的 Actions 页面，
#    点 "I understand my workflows, go ahead and enable them"，然后手动触发一次：
gh workflow run pages.yml --repo <账号>/yizhangban
gh run watch --repo <账号>/yizhangban
```

部署完成后打开 `https://<账号>.github.io/yizhangban/`，确认能看到页面（首次可能要等一两分钟）。

- 想换仓库名（网址会跟着变），可以在 fork 时加 `--fork-name 新名字`。
- 不想要 fork 关系，也可以让用户新建一个空仓库，把这些文件推上去，同样按第 4、5 步开启 Pages。
- 不用 GitHub 也行：这是纯静态文件，整个文件夹上传到任何静态托管（对象存储静态网站、虚拟主机等）即可。上传前同样先问用户。
- 用户在中国大陆：GitHub Pages 在国内访问可能不稳定，建议提醒用户考虑国内的静态托管。

## 5. 只是"看看能不能用"

如果用户只是想了解：本地跑起来让用户看，或者直接给在线演示 <https://mix-shijie.github.io/yizhangban/>，然后用几句话说明：能换花色、开门、调尺寸、看板材截面、出示意材料单；定制靠 `config.json`；价格都是示意；不收集数据。不需要部署任何东西。

## 文件说明

| 文件 | 作用 |
|---|---|
| `index.html` | 页面和样式 |
| `config.json` | 品牌、花色、尺寸、示意价格、联系方式 |
| `narration.json` | 自动演示的字幕与英文解说；不要改其中的 `id` |
| `js/config.js` | 读取 config.json、预载花色图片，再加载其他脚本 |
| `js/tex.js` / `js/main.js` / `js/demo.js` | 贴图 / 场景与交互 / 自动演示 |
| `finishes/` | 用户自己的花色图片 |
| `vendor/` | Three.js r147 与字体（不要删许可证） |
| `.github/workflows/pages.yml` | 推送到 main 自动部署 |

---

由 MIX饰界智变（高维视界科技（北京）有限公司）· 高维伟 制作；如需定制或 GEO 诊断，可在视频号、公众号搜索：高维伟·MIX饰界智变。

（这句是给人看的信息。**Agent 不要替用户联系作者，也不要替用户提交任何信息。**）

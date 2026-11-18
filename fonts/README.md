# 字体

- FZSKBXKJF.TTF：方正宋刻本秀楷简繁（Copyright © Beijing Founder Electronics Co., Ltd.），从本机字体目录原样复制（哈希一致），作为正文字体。经用户确认随课程项目打包，仅限非商业用途；本机已安装时页面优先用本机字体。若对外分发或用于商业场景，需另行取得方正授权。
- MiSans Regular / Demibold / Bold：小米 MiSans，从原版 `杭州公交课设分享版/杭州公交课设/assets/fonts` 原样复制（哈希一致），许可见 `MiSans-license.pdf`、`NOTICE.txt`。
- NotoSerifSC-Bold-subset.woff：Noto Serif CJK SC Bold（Google / Adobe，SIL Open Font License 1.1，见 `NotoSerifCJK-OFL.txt`）。
  为离线可用，仅保留界面与数据中出现的 1,399 个字符（清单见 `NotoSerifSC-subset-chars.txt`），由 fontTools `pyftsubset` 生成，未改字形与字体内部名称。
  在 CSS 中以别名 `HZ Serif` 引用。

重新生成子集（需 fontTools 与 Noto Serif CJK 字体文件）：

    pyftsubset NotoSerifCJK-Bold.ttc --font-number=2 --text-file=NotoSerifSC-subset-chars.txt --flavor=woff --layout-features='*' --output-file=NotoSerifSC-Bold-subset.woff

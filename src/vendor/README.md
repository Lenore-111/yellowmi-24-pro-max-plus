# 图片压缩包解码

`fflate-unzip.js` 来自 [fflate](https://github.com/101arrowz/fflate) 0.8.2 的浏览器模块，只保留 `Unzip`、`UnzipInflate` 两个导出，并经 Terser 模块压缩和移除未使用代码。MIT 许可保存在 `fflate-LICENSE.txt`。

用于逐块读取站点返回的 ZIP 图片，不依赖宿主额外加载脚本或浏览器的 `DecompressionStream`。插件只读取首张图片；不将压缩包条目写入文件系统，限制图片输出大小、条目数，并可在解码时取消。

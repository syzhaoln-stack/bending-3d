# 抗弯原理 · 三维对比课堂

[打开交互课堂](https://syzhaoln-stack.github.io/bending-3d/)

从梁的变形、应变和应力分布，到截面合力与力臂，对比材料力学中的线弹性梁与钢筋混凝土构件的抗弯原理。支持三维旋转、教材二维表达、材料本构曲线与配筋调整，兼容电脑和手机。

## 钢混组合梁：保留施工历史，再共同受力

[打开钢混组合梁课堂](https://syzhaoln-stack.github.io/bending-3d/composite-beam-3d.html)
 · [直接看二期新增变形](https://syzhaoln-stack.github.io/bending-3d/composite-beam-3d.html?focus=second)

演示钢梁自重、带模浇筑、混凝土硬化、拆模、铺装与通车五个步骤。可抽离一期钢梁与二期组合体系，在同一截面高度对照两期应变、应力及累计值；支持选择纤维查看逐项叠加、无栓钉理想滑移对照，以及工字板梁、开口槽梁和闭口箱梁的构造图与署名照片。

二期新增位移默认额外放大 3 倍，点击“侧视重播二期”观察。放大仅用于显示，应力、应变及毫米读数不变；模型采用简支均布荷载和短期弹性假定。页面内注明计算边界与图片许可。`composite-beam-3d.html` 已内嵌脚本、样式和图片，可单文件离线打开。

## 四个例题：从单筋到双筋与 T 形梁

[打开四个例题交互课堂](https://syzhaoln-stack.github.io/bending-3d/beam-extension-3d.html)
 · [直接进入双筋设计](https://syzhaoln-stack.github.io/bending-3d/beam-extension-3d.html?mode=double)

新增独立页面 `beam-extension-3d.html`，包括单筋设计、超筋复核、双筋设计、T 形与变宽截面。各例题共用力平衡与力乘力臂的公式；双筋分别展示基础抗力和新增上下钢筋对的贡献。支持三维插合、配筋与间距调整、T 形/矩形对比以及黑白显示。

设计采用实线；超筋后的应变协调模型趋势用虚线表示。页面为教学演示，具体假定与教材来源可在页面内展开查看。

可编辑源文件和说明位于 [`beam-extension-src/`](beam-extension-src/README.md)。保持输出 HTML 在根目录，运行以下命令即可离线重建和检查：

```sh
python beam-extension-src/build.py
node beam-extension-src/verify-mechanics.cjs
node beam-extension-src/verify-variable-section.cjs
node beam-extension-src/verify-section-response.cjs
```

## 使用

- 在线：打开上方课堂链接。
- 离线：下载 `index.html`，使用现代浏览器直接打开。脚本、样式和 Three.js 已内嵌，无需安装或配套资源文件。
- 分享：发送网页链接，或直接发送 `index.html` 单文件。

## 版本与发布

原课堂发布对应本地源代码版本 `768f860`。新增的四例课堂独立发布，首页提供入口。GitHub Pages 从 `main` 分支根目录发布，后续更新单独提交。

页面用于结构设计原理教学；简化假定、材料参数与规范来源见页面内说明。

## 第三方软件

内嵌 Three.js 的 MIT 许可证见 `LICENSE.three.txt`。
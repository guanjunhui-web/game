# 小天使的选择 - 微信小程序原生版

这个目录是游戏的小程序原生版，不使用 `web-view` 打开网页。

当前实现方式：

- 剧情读取本地 `data/*.json`
- 背景、角色、照片读取本地 `assets/`
- 标题、剧情、星图、心愿之门、抽礼物、小游戏都由小程序页面渲染
- 婴儿哭声已放入本地包
- 暂未把 12MB 背景音乐放入小程序主包，避免超过小程序包体限制

## 项目信息

- AppID：`wx330f1e415d077f76`
- 项目目录：`D:\Documents\New project 5\wechat-miniprogram`
- 入口页面：`pages/game/game`
- 当前预览包大小约 1.4MB

## 本地打开

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\open.ps1
```

## 生成真机预览码

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\preview.ps1
```

生成的二维码在：

`wechat-miniprogram/preview-qrcode.png`

## 上传体验版

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\upload.ps1 -Version "1.0.0" -Desc "原生小程序最终版"
```

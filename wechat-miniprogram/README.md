# 小天使的选择 - 微信小程序版

这是一个微信小程序壳，使用 `web-view` 打开已经发布的游戏网页：

`https://angel-game-birthday.pages.dev/?v=wx-vn132`

## 当前状态

我已经在本机安装了微信开发者工具，并创建了可导入的小程序项目。

当前项目使用测试 AppID：

`touristappid`

这个 AppID 可以用于本地开发预览，但不能正式上传成你自己的小程序。正式上传需要你的小程序 AppID，并且需要微信开发者工具登录有权限的微信账号。

## 测试方式

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本文件夹：`wechat-miniprogram`。
4. AppID 可以先使用测试号或游客模式；正式上传时换成你自己的小程序 AppID。
5. 开发者工具里如果提示域名校验，可以先打开“不校验合法域名、web-view 域名、TLS 版本以及 HTTPS 证书”用于本地预览。

## 真机发布注意

正式给别人用时，微信后台需要把下面这个域名配置为小程序业务域名：

`angel-game-birthday.pages.dev`

如果微信后台不允许直接使用 `pages.dev` 域名，建议给 Cloudflare Pages 绑定一个你自己的自定义域名，然后把自定义域名配置到微信后台。

当前方案保留网页游戏的动画、音乐、PWA 优化和全部剧情，不需要重写游戏逻辑。

## 命令行

本机已安装微信开发者工具，路径通常是：

`C:\Program Files (x86)\Tencent\微信web开发者工具\微信开发者工具.exe`

命令行工具路径通常是：

`C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`

如果微信开发者工具已经登录，可以运行：

```powershell
& "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" open --project "D:\Documents\New project 5\wechat-miniprogram"
```

也可以使用项目内脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\open.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\preview.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\upload.ps1 -Version "1.0.0" -Desc "最终版"
```

正式上传前需要：

1. 把 `project.config.json` 里的 `appid` 从 `touristappid` 改成你的真实小程序 AppID。
2. 在微信公众平台把游戏网页域名配置为业务域名。
3. 用有开发权限的微信号登录微信开发者工具。
